package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"sync"
	"time"
)

const warning = "Official F1 refresh is unavailable. Showing the last verified snapshot; calculations use that snapshot."

func validate(raw []byte, year int) error {
	var d map[string]json.RawMessage
	if json.Unmarshal(raw, &d) != nil {
		return errors.New("invalid season JSON")
	}
	for _, key := range []string{"year", "fetchedAt", "source", "completedRaces", "countbackAvailable", "constructorCountbackAvailable", "sources"} {
		if len(d[key]) == 0 || bytes.Equal(d[key], []byte("null")) {
			return fmt.Errorf("missing %s", key)
		}
	}
	if value, exists := d["warning"]; exists {
		var text string
		if bytes.Equal(value, []byte("null")) || json.Unmarshal(value, &text) != nil {
			return errors.New("invalid warning")
		}
	}
	var y int
	var at, source string
	if json.Unmarshal(d["year"], &y) != nil || y != year || year < 1950 || year > 9999 {
		return errors.New("invalid season year")
	}
	if json.Unmarshal(d["fetchedAt"], &at) != nil {
		return errors.New("missing timestamp")
	}
	t, e := time.Parse(time.RFC3339Nano, at)
	if e != nil || t.After(time.Now().Add(time.Minute)) {
		return errors.New("invalid timestamp")
	}
	if json.Unmarshal(d["source"], &source) != nil || (source != "official" && source != "cached") {
		return errors.New("invalid provenance")
	}
	for _, key := range []string{"drivers", "constructors", "calendar", "sessions", "raceResults", "sprintResults"} {
		var a []json.RawMessage
		if json.Unmarshal(d[key], &a) != nil || a == nil {
			return fmt.Errorf("missing array %s", key)
		}
		if (key == "drivers" || key == "constructors" || key == "calendar") && len(a) == 0 {
			return fmt.Errorf("empty %s", key)
		}
	}
	if err := validateNested(d); err != nil {
		return err
	}
	for _, key := range []string{"countbackAvailable", "constructorCountbackAvailable"} {
		var b bool
		if json.Unmarshal(d[key], &b) != nil {
			return fmt.Errorf("missing %s", key)
		}
	}
	var n int
	if json.Unmarshal(d["completedRaces"], &n) != nil || n < 0 {
		return errors.New("invalid completed races")
	}
	var sources map[string]string
	if json.Unmarshal(d["sources"], &sources) != nil {
		return errors.New("invalid sources")
	}
	for _, key := range []string{"standings", "constructors", "calendar", "rules"} {
		if sources[key] == "" {
			return errors.New("missing source")
		}
	}
	return nil
}
func cached(raw []byte) []byte {
	var d map[string]json.RawMessage
	_ = json.Unmarshal(raw, &d)
	d["source"] = json.RawMessage(`"cached"`)
	d["warning"], _ = json.Marshal(warning)
	b, _ := json.Marshal(d)
	return b
}
func fresh(raw []byte, now time.Time) bool {
	var d struct {
		FetchedAt time.Time
		Source    string
	}
	return json.Unmarshal(raw, &d) == nil && d.Source == "official" && now.Sub(d.FetchedAt) >= 0 && now.Sub(d.FetchedAt) < 5*time.Minute
}

type flight struct {
	year int
	done chan struct{}
	raw  []byte
	err  error
}
type service struct {
	db      store
	ingest  func(context.Context, int) ([]byte, error)
	ctx     context.Context
	mu      sync.Mutex
	pending *flight
	last    []byte
	year    int
}

func (s *service) Get(ctx context.Context, year int) ([]byte, error) {
	s.mu.Lock()
	f := s.pending
	if f == nil {
		f = &flight{done: make(chan struct{}), year: year}
		s.pending = f
		go func() { f.raw, f.err = s.refresh(year); s.mu.Lock(); s.pending = nil; close(f.done); s.mu.Unlock() }()
	}
	s.mu.Unlock()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-f.done:
		if f.year != year {
			return s.Get(ctx, year)
		}
		return f.raw, f.err
	}
}
func (s *service) refresh(year int) ([]byte, error) {
	ctx, cancel := context.WithTimeout(s.ctx, 100*time.Second)
	defer cancel()
	old, err := s.db.Load(ctx, year)
	if err != nil || validate(old, year) != nil {
		old = nil
		if s.year == year && validate(s.last, year) == nil {
			old = s.last
		}
	}
	if fresh(old, time.Now()) {
		s.last = old
		s.year = year
		return old, nil
	}
	raw, err := s.ingest(ctx, year)
	if err == nil {
		err = validate(raw, year)
	}
	if err == nil {
		var d struct{ Source string }
		_ = json.Unmarshal(raw, &d)
		if d.Source != "official" {
			err = errors.New("ingestion must be official")
		}
	}
	if err == nil {
		err = s.db.Save(ctx, year, raw)
	}
	if err == nil {
		s.last = raw
		s.year = year
		return raw, nil
	}
	if old != nil {
		return cached(old), nil
	}
	return nil, errors.New("official season data unavailable and no same-season snapshot exists")
}

type boundedBuffer struct {
	bytes.Buffer
	limit int
}

func (b *boundedBuffer) Write(p []byte) (int, error) {
	if b.Len()+len(p) > b.limit {
		return 0, errors.New("ingestion output exceeds limit")
	}
	return b.Buffer.Write(p)
}
func nodeIngester(script string) func(context.Context, int) ([]byte, error) {
	return func(ctx context.Context, year int) ([]byte, error) {
		ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
		defer cancel()
		cmd := exec.CommandContext(ctx, "node", script, strconv.Itoa(year))
		cmd.WaitDelay = time.Second
		out := &boundedBuffer{limit: 16 << 20}
		cmd.Stdout = out
		cmd.Stderr = &boundedBuffer{limit: 16 << 10}
		if err := cmd.Run(); err != nil {
			return nil, errors.New("official ingestion subprocess failed or timed out")
		}
		return out.Bytes(), nil
	}
}
