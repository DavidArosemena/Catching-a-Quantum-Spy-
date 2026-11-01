"""
aggregate.py  --  loads sim/output/qubit_events_sweep.csv into SQLite and runs
sim/aggregate.sql. Writes sim/output/qber_by_scenario.csv.

Usage:  python3 sim/aggregate.py
"""
import csv
import math
import os
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "output")


def main() -> None:
    con = sqlite3.connect(":memory:")
    con.create_function("SQRT", 1, lambda x: None if x is None else math.sqrt(x))
    with open(os.path.join(OUT, "qubit_events_sweep.csv")) as fh:
        rd = csv.reader(fh)
        header = next(rd)
        con.execute(f"CREATE TABLE qubit_events ({', '.join(header)})")
        ints = {"f_pct", "run_seed", "idx", "alice_bit", "eve_on", "bob_bit",
                "noise_flip", "sifted", "error"}

        def conv(col, v):
            if v == "NULL":
                return None
            if col in ints:
                return int(v)
            if col == "p_pct":
                return float(v)
            if col == "eve_bit":
                return int(v)
            return v

        con.executemany(
            f"INSERT INTO qubit_events VALUES ({', '.join('?' * len(header))})",
            ([conv(c, v) for c, v in zip(header, row)] for row in rd))

    sql = open(os.path.join(HERE, "aggregate.sql")).read()
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    with open(os.path.join(OUT, "qber_by_scenario.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        w.writerows(rows)
    print(" | ".join(cols))
    for r in rows:
        print(" | ".join(str(v) for v in r))


if __name__ == "__main__":
    main()
