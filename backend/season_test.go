package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func fixture(t *testing.T, year int, at time.Time) []byte {
	t.Helper()
	b, e := os.ReadFile("../site/lib/snapshot.json")
	if e != nil {
		t.Fatal(e)
	}
	var d map[string]any
	if e = json.Unmarshal(b, &d); e != nil {
		t.Fatal(e)
	}
	d["year"] = year
	d["fetchedAt"] = at.UTC().Format(time.RFC3339Nano)
	d["source"] = "official"
	b, _ = json.Marshal(d)
	return b
}

type memoryStore struct {
	raw   []byte
	fail  bool
	saves int
}

func (m *memoryStore) Load(context.Context, int) ([]byte, error) { return m.raw, nil }
func (m *memoryStore) Save(_ context.Context, _ int, b []byte) error {
	if m.fail {
		return errors.New("write failed")
	}
	m.raw = b
	m.saves++
	return nil
}
func TestRefreshAndFallback(t *testing.T) {
	year := time.Now().UTC().Year()
	old := fixture(t, year, time.Now().Add(-time.Hour))
	live := fixture(t, year, time.Now())
	for _, mode := range []string{"upstream", "write", "malformed", "wrong-year"} {
		t.Run(mode, func(t *testing.T) {
			db := &memoryStore{raw: old, fail: mode == "write"}
			s := &service{db: db, ctx: context.Background(), ingest: func(context.Context, int) ([]byte, error) {
				switch mode {
				case "upstream":
					return nil, errors.New("offline")
				case "malformed":
					return []byte(`{}`), nil
				case "wrong-year":
					return fixture(t, year-1, time.Now()), nil
				}
				return live, nil
			}}
			b, e := s.Get(context.Background(), year)
			if e != nil {
				t.Fatal(e)
			}
			var d map[string]any
			_ = json.Unmarshal(b, &d)
			var original map[string]any
			_ = json.Unmarshal(old, &original)
			if d["source"] != "cached" || d["warning"] != warning || d["fetchedAt"] != original["fetchedAt"] || string(db.raw) != string(old) {
				t.Fatal("fallback changed original snapshot")
			}
		})
	}
	db := &memoryStore{raw: fixture(t, year-1, time.Now())}
	s := &service{db: db, ctx: context.Background(), ingest: func(context.Context, int) ([]byte, error) { return nil, errors.New("offline") }}
	if _, e := s.Get(context.Background(), year); e == nil {
		t.Fatal("accepted wrong season")
	}
}
func TestConcurrentRefreshAndFreshRestart(t *testing.T) {
	year := time.Now().UTC().Year()
	db := &memoryStore{}
	var calls atomic.Int32
	gate := make(chan struct{})
	s := &service{db: db, ctx: context.Background(), ingest: func(context.Context, int) ([]byte, error) {
		calls.Add(1)
		<-gate
		return fixture(t, year, time.Now()), nil
	}}
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, e := s.Get(context.Background(), year); e != nil {
				t.Error(e)
			}
		}()
	}
	time.Sleep(30 * time.Millisecond)
	close(gate)
	wg.Wait()
	if calls.Load() != 1 || db.saves != 1 {
		t.Fatalf("calls=%d saves=%d", calls.Load(), db.saves)
	}
	restarted := &service{db: db, ctx: context.Background(), ingest: func(context.Context, int) ([]byte, error) { t.Error("fresh restart fetched"); return nil, nil }}
	if _, e := restarted.Get(context.Background(), year); e != nil {
		t.Fatal(e)
	}
}
func TestHandlerGuards(t *testing.T) {
	for _, tc := range []struct {
		host, origin, method string
		want                 int
	}{{"evil.test:5174", "", "GET", 403}, {addr, "https://evil.test", "GET", 403}, {addr, "", "POST", 405}} {
		r := httptest.NewRequest(tc.method, "http://"+tc.host+"/api/season", nil)
		r.Header.Set("Origin", tc.origin)
		w := httptest.NewRecorder()
		handler(nil).ServeHTTP(w, r)
		if w.Code != tc.want {
			t.Fatalf("got %d want %d", w.Code, tc.want)
		}
	}
}
func TestDBRejectsRemote(t *testing.T) {
	for _, dsn := range []string{"postgres://u:p@192.0.2.1/db", "host=example.com dbname=f1"} {
		if _, e := openDB(context.Background(), dsn); e == nil {
			t.Fatal("remote database allowed")
		}
	}
}
func TestSubprocessBounds(t *testing.T) {
	dir := t.TempDir()
	script := filepath.Join(dir, "ingest.mjs")
	if e := os.WriteFile(script, []byte("setInterval(()=>{},1000)"), 0600); e != nil {
		t.Fatal(e)
	}
	ctx, c := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer c()
	start := time.Now()
	if _, e := nodeIngester(script)(ctx, 2026); e == nil {
		t.Fatal("timeout accepted")
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("subprocess did not stop")
	}
	b := &boundedBuffer{limit: 2}
	if _, e := b.Write([]byte("123")); e == nil {
		t.Fatal("output limit ignored")
	}
}
func TestPostgresIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to an isolated local PostgreSQL database")
	}
	ctx := context.Background()
	db, e := openDB(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer db.pool.Close()
	if e = db.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	year := time.Now().UTC().Year()
	old := fixture(t, year, time.Now().Add(-time.Hour))
	if e = db.Save(ctx, year, old); e != nil {
		t.Fatal(e)
	}
	if e = db.Migrate(ctx); e != nil {
		t.Fatal(e)
	}
	var count int
	if e = db.pool.QueryRow(ctx, "SELECT count(*) FROM schema_migrations").Scan(&count); e != nil || count != 1 {
		t.Fatalf("migration count %d %v", count, e)
	}
	// Reopen the pool to demonstrate persistence across service restarts.
	db.pool.Close()
	db, e = openDB(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer db.pool.Close()
	stored, e := db.Load(ctx, year)
	if e != nil || validate(stored, year) != nil {
		t.Fatalf("stored payload: %v", e)
	}
	s := &service{db: db, ctx: ctx, ingest: func(context.Context, int) ([]byte, error) { return nil, errors.New("upstream offline") }}
	b, e := s.Get(ctx, year)
	if e != nil {
		t.Fatal(e)
	}
	var d map[string]any
	_ = json.Unmarshal(b, &d)
	if d["source"] != "cached" {
		t.Fatal("no cached fallback")
	}
	// A real PostgreSQL trigger rejects writes, exercising atomic failure fallback.
	_, e = db.pool.Exec(ctx, `CREATE OR REPLACE FUNCTION reject_season_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test write failure'; END $$; CREATE TRIGGER reject_write BEFORE INSERT OR UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION reject_season_write()`)
	if e != nil {
		t.Fatal(e)
	}
	defer db.pool.Exec(ctx, "DROP TRIGGER IF EXISTS reject_write ON seasons; DROP FUNCTION IF EXISTS reject_season_write()")
	s.ingest = func(context.Context, int) ([]byte, error) { return fixture(t, year, time.Now()), nil }
	b, e = s.Get(ctx, year)
	if e != nil {
		t.Fatal(e)
	}
	_ = json.Unmarshal(b, &d)
	if d["source"] != "cached" {
		t.Fatal("failed write published live")
	}
	after, e := db.Load(ctx, year)
	if e != nil || string(after) != string(stored) {
		t.Fatal("failed write corrupted snapshot")
	}
}

func TestValidationRejectsMalformedFields(t *testing.T) {
	year := time.Now().UTC().Year()
	for _, field := range []string{"countbackAvailable", "completedRaces", "sources", "drivers", "raceResults"} {
		var d map[string]json.RawMessage
		_ = json.Unmarshal(fixture(t, year, time.Now()), &d)
		d[field] = json.RawMessage("null")
		b, _ := json.Marshal(d)
		if validate(b, year) == nil {
			t.Errorf("accepted null %s", field)
		}
	}
	var d map[string]json.RawMessage
	_ = json.Unmarshal(fixture(t, year, time.Now()), &d)
	d["drivers"] = json.RawMessage(`[{}]`)
	b, _ := json.Marshal(d)
	if validate(b, year) == nil {
		t.Fatal("accepted malformed driver")
	}
}
