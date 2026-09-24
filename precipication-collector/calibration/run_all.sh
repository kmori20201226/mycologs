#!/usr/bin/env bash
PY=/home/kmori/miniconda3/envs/mycologs/bin/python
for spec in "44 43" "46 43" "38 43" "38 47"; do
  set -- $spec
  echo "############ pref-$1 against ref-$2 ############"
  $PY auto_affine.py --pref $1 --ref $2 --hours 10 2>&1
  echo
done
