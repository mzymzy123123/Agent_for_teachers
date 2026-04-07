#!/bin/bash
cd /mnt/pfs_l2/jieti_team/LA/mazeying/competition
source .venv/bin/activate 2>/dev/null || true
export TAL_MLOPS_APP_ID="${TAL_MLOPS_APP_ID:-你的_APP_ID}"
export TAL_MLOPS_APP_KEY="${TAL_MLOPS_APP_KEY:-你的_APP_KEY}"
uvicorn backend.main:app --host 0.0.0.0 --port 8000
