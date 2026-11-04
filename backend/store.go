package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"net"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

type store interface {
	Load(context.Context, int) ([]byte, error)
	Save(context.Context, int, []byte) error
}
type postgres struct{ pool *pgxpool.Pool }

func openDB(ctx context.Context, dsn string) (*postgres, error) {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, errors.New("invalid DATABASE_URL")
	}
	hosts := []string{config.ConnConfig.Host}
	for _, f := range config.ConnConfig.Fallbacks {
		hosts = append(hosts, f.Host)
	}
	for _, h := range hosts {
		ip := net.ParseIP(h)
		if !(strings.HasPrefix(h, "/") || h == "localhost" || ip != nil && ip.IsLoopback()) {
			return nil, errors.New("database must use loopback or a local Unix socket")
		}
	}
	config.ConnConfig.ConnectTimeout = 5_000_000_000
	p, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, errors.New("database configuration failed")
	}
	if err = p.Ping(ctx); err != nil {
		p.Close()
		return nil, errors.New("PostgreSQL unavailable; check DATABASE_URL and start the local database")
	}
	return &postgres{p}, nil
}
func (p *postgres) Migrate(ctx context.Context) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(51735174)"); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	files, err := migrations.ReadDir("migrations")
	if err != nil {
		return err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Name() < files[j].Name() })
	for _, file := range files {
		var exists bool
		name := file.Name()
		if err = tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version=$1)", name).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		sql, _ := migrations.ReadFile("migrations/" + name)
		if _, err = tx.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("migration %s failed", name)
		}
		if _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(version) VALUES ($1)", name); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
func (p *postgres) Load(ctx context.Context, year int) ([]byte, error) {
	var raw []byte
	err := p.pool.QueryRow(ctx, "SELECT payload FROM seasons WHERE year=$1", year).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return raw, err
}
func (p *postgres) Save(ctx context.Context, year int, raw []byte) error {
	if err := validate(raw, year); err != nil {
		return err
	}
	_, err := p.pool.Exec(ctx, "INSERT INTO seasons(year,fetched_at,payload) VALUES ($1,($2::jsonb->>'fetchedAt')::timestamptz,$2::jsonb) ON CONFLICT(year) DO UPDATE SET fetched_at=EXCLUDED.fetched_at,payload=EXCLUDED.payload", year, string(raw))
	return err
}
