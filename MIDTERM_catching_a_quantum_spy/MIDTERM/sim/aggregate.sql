-- aggregate.sql  --  turns raw qubit events into the QBER table behind View 6.
-- Run with:  python3 sim/aggregate.py   (loads the CSV into SQLite, runs this file)
--
-- QBER is POOLED: total errors / total sifted bits across repeated runs.
-- We never average per-run percentages, because runs keep different numbers
-- of sifted bits and a plain mean of percentages would overweight short runs.
-- Unsifted bits are discarded by the protocol (not missing data).
-- Eve's columns are NULL when she did not intercept; they are never imputed.

SELECT scenario,
       f_pct,
       p_pct,
       COUNT(*)                                        AS qubits_sent,
       SUM(sifted)                                     AS sifted_bits,
       SUM(error)                                      AS error_bits,
       ROUND(100.0 * SUM(error) / NULLIF(SUM(sifted), 0), 2) AS qber_pct,
       ROUND(100.0 * 1.96 * SQRT( (1.0 * SUM(error) / SUM(sifted))
                                * (1 - 1.0 * SUM(error) / SUM(sifted))
                                / SUM(sifted) ), 2)    AS ci95_pct,
       ROUND(100.0 * SUM(eve_on) / COUNT(*), 1)        AS observed_intercept_pct
FROM qubit_events
GROUP BY scenario, f_pct, p_pct
ORDER BY scenario, f_pct;
