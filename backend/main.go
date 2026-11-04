package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const addr = "127.0.0.1:5174"

func handler(s *service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if (r.Host != addr && r.Host != "localhost:5174") || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != "http://127.0.0.1:5173" && r.Header.Get("Origin") != "http://localhost:5173" && r.Header.Get("Origin") != "http://"+addr && r.Header.Get("Origin") != "http://localhost:5174") {
			http.Error(w, "Local access only", 403)
			return
		}
		if r.URL.Path != "/api/season" {
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			w.WriteHeader(405)
			return
		}
		raw, err := s.Get(r.Context(), time.Now().UTC().Year())
		if err != nil {
			w.WriteHeader(503)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Official F1 data is unavailable. Check the local backend/database and try again later."})
			return
		}
		_, _ = w.Write(raw)
	})
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	dbctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	db, err := openDB(dbctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer db.pool.Close()
	if err = db.Migrate(dbctx); err != nil {
		return err
	}
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		log.Print("Migrations applied")
		return nil
	}
	script := os.Getenv("F1_INGEST_SCRIPT")
	if script == "" {
		script = "../site/scripts/ingest-season.mjs"
	}
	s := &service{db: db, ingest: nodeIngester(script), ctx: ctx}
	// Bootstrap only a same-year verified snapshot, retaining its original timestamp.
	year := time.Now().UTC().Year()
	if old, e := db.Load(dbctx, year); e == nil && old == nil {
		if raw, e := os.ReadFile("../site/lib/snapshot.json"); e == nil && validate(raw, year) == nil {
			if e = db.Save(dbctx, year, cached(raw)); e != nil {
				return e
			}
		}
	}
	srv := &http.Server{Addr: addr, Handler: handler(s), ReadHeaderTimeout: 5 * time.Second, WriteTimeout: 105 * time.Second, IdleTimeout: 60 * time.Second}
	done := make(chan error, 1)
	go func() { log.Print("Go season API http://" + addr); done <- srv.ListenAndServe() }()
	select {
	case err = <-done:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, c := context.WithTimeout(context.Background(), 5*time.Second)
		defer c()
		return srv.Shutdown(shutdown)
	}
}
func main() {
	if err := run(); err != nil {
		log.Printf("Backend startup/shutdown failed: %v", err)
		os.Exit(1)
	}
}
