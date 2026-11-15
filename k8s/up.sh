#!/usr/bin/env bash
# 클러스터를 만들고 Cilium을 설치한 뒤 앱 이미지를 싣고 워크로드를 올린다. 정책은 여기서 걸지 않는다.
# 사용: 저장소 루트에서 ./k8s/up.sh   (필요한 도구: docker, kind, kubectl, cilium)
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER=enroll-lab
CILIUM_VERSION=1.20.1

docker build -f k8s/Dockerfile -t secure-enroll-demo:kind .
kind create cluster --config k8s/kind-config.yaml
kind load docker-image secure-enroll-demo:kind --name "$CLUSTER"

# kube-proxy 없이 Cilium이 서비스 주소 변환까지 맡는다. Hubble은 차단 기록을 보기 위해 켠다.
cilium install --version "$CILIUM_VERSION" \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost="$CLUSTER-control-plane" --set k8sServicePort=6443 \
  --set hubble.enabled=true
cilium status --wait

kubectl apply -f k8s/manifests/namespace.yaml
kubectl apply -f k8s/manifests/app.yaml -f k8s/manifests/clients.yaml
kubectl -n enroll rollout status deploy/enroll-app --timeout=180s
kubectl -n enroll wait --for=condition=Ready pod/gateway pod/bystander --timeout=180s
kubectl -n enroll-outside wait --for=condition=Ready pod/outsider --timeout=180s
kubectl get pods -n enroll -o wide
kubectl get pods -n enroll-outside -o wide
