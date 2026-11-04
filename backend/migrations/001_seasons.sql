CREATE TABLE seasons (
    year integer PRIMARY KEY CHECK (year BETWEEN 1950 AND 9999),
    fetched_at timestamptz NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND (payload->>'year')::integer = year)
);
