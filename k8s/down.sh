#!/usr/bin/env bash
# 이 저장소가 만든 클러스터만 지운다.
set -euo pipefail
kind delete cluster --name enroll-lab
