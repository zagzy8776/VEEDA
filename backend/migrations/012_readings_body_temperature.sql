-- Allow body-temperature readings in the `readings` table.
--
-- A Bluetooth or typed thermometer is the third reading kind the app supports
-- alongside blood pressure and blood glucose. The original `readings.kind`
-- CHECK (added in 008) only permitted 'blood_pressure' and 'blood_glucose', so a
-- temperature row would be rejected by the database even though the client and
-- `readings-validate.js` now accept it. This widens that CHECK to include
-- 'body_temperature'.
--
-- The value/unit pair is already present (008), so no new column is needed: a
-- temperature is stored as `value` (NUMERIC) with `unit` of '°C' or '°F', and
-- `context` stays NULL (a meal tag is only meaningful for glucose).
--
-- Idempotent: the old constraint is dropped if present and the widened one is
-- added only when it is missing, so re-running is a no-op.
ALTER TABLE readings
  DROP CONSTRAINT IF EXISTS readings_kind_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'readings_kind_check'
  ) THEN
    ALTER TABLE readings
      ADD CONSTRAINT readings_kind_check
      CHECK (kind IN ('blood_pressure', 'blood_glucose', 'body_temperature'));
  END IF;
END
$$;
