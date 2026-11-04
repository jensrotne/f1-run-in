package main

import (
	"encoding/json"
	"fmt"
	"math"
	"time"
)

// These checks mirror the fields consumed by the dashboard and calculator.
// Calendar sessions deliberately have less metadata than projected sessions.
func fields(record map[string]any, schema map[string]string) error {
	if record == nil {
		return fmt.Errorf("expected object")
	}
	for key, kind := range schema {
		value, exists := record[key]
		if !exists || value == nil {
			return fmt.Errorf("missing %s", key)
		}
		valid := false
		switch kind {
		case "string":
			_, valid = value.(string)
		case "text":
			v, ok := value.(string)
			valid = ok && v != ""
		case "date":
			v, ok := value.(string)
			_, err := time.Parse(time.RFC3339Nano, v)
			valid = ok && err == nil
		case "bool":
			_, valid = value.(bool)
		case "number":
			v, ok := value.(float64)
			valid = ok && v >= 0
		case "positiveInt":
			v, ok := value.(float64)
			valid = ok && v > 0 && math.Trunc(v) == v
		}
		if !valid {
			return fmt.Errorf("invalid %s (%s required)", key, kind)
		}
	}
	for _, key := range []string{"portraitUrl", "teamLogoUrl", "circuitImageUrl"} {
		if value, exists := record[key]; exists {
			if _, ok := value.(string); !ok {
				return fmt.Errorf("invalid %s", key)
			}
		}
	}
	return nil
}
func objects(value any, min int) ([]map[string]any, error) {
	array, ok := value.([]any)
	if !ok || len(array) < min {
		return nil, fmt.Errorf("expected array with at least %d records", min)
	}
	records := make([]map[string]any, len(array))
	for i, value := range array {
		record, ok := value.(map[string]any)
		if !ok || record == nil {
			return nil, fmt.Errorf("invalid record %d", i)
		}
		records[i] = record
	}
	return records, nil
}
func session(record map[string]any, projected bool) error {
	if err := fields(record, map[string]string{"type": "text", "start": "date", "end": "date", "completed": "bool"}); err != nil {
		return err
	}
	if record["type"] != "race" && record["type"] != "sprint" {
		return fmt.Errorf("invalid session type")
	}
	if projected {
		return fields(record, map[string]string{"round": "positiveInt", "name": "text", "slug": "text", "url": "text", "maxPoints": "positiveInt"})
	}
	return nil
}
func validateNested(raw map[string]json.RawMessage) error {
	for _, key := range []string{"drivers", "constructors", "calendar", "sessions", "raceResults", "sprintResults"} {
		var value any
		if err := json.Unmarshal(raw[key], &value); err != nil {
			return err
		}
		min := 0
		if key == "drivers" || key == "constructors" {
			min = 2
		}
		if key == "calendar" {
			min = 1
		}
		records, err := objects(value, min)
		if err != nil {
			return fmt.Errorf("%s: %w", key, err)
		}
		for index, record := range records {
			err = nil
			switch key {
			case "drivers", "constructors":
				err = fields(record, map[string]string{"id": "text", "name": "text", "code": "text", "position": "positiveInt", "team": "text", "points": "number", "color": "text", "url": "text"})
				finishes, ok := record["finishes"].([]any)
				if !ok || len(finishes) < 30 {
					err = fmt.Errorf("invalid finishes")
				}
				for _, value := range finishes {
					v, ok := value.(float64)
					if !ok || v < 0 || math.Trunc(v) != v {
						err = fmt.Errorf("invalid finish count")
					}
				}
			case "calendar", "raceResults", "sprintResults":
				err = fields(record, map[string]string{"slug": "text", "name": "text", "round": "positiveInt", "url": "text", "date": "date"})
				if err != nil {
					break
				}
				if key == "calendar" {
					err = fields(record, map[string]string{"sprint": "bool", "completed": "bool"})
					if err != nil {
						break
					}
					sessions, e := objects(record["sessions"], 1)
					if e != nil {
						err = e
						break
					}
					hasRace := false
					for _, item := range sessions {
						if e = session(item, false); e != nil {
							err = e
							break
						}
						hasRace = hasRace || item["type"] == "race"
					}
					if err == nil && !hasRace {
						err = fmt.Errorf("calendar weekend requires race session")
					}
				} else {
					rows, e := objects(record["classification"], 1)
					if e != nil {
						err = e
						break
					}
					for _, row := range rows {
						err = fields(row, map[string]string{"driverId": "text", "name": "text", "code": "text", "position": "text", "number": "string", "team": "text", "laps": "string", "time": "string", "points": "number", "color": "text"})
						if err != nil {
							break
						}
					}
				}
			case "sessions":
				err = session(record, true)
			}
			if err != nil {
				return fmt.Errorf("%s[%d]: %w", key, index, err)
			}
		}
	}
	return nil
}
