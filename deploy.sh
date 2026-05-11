#!/bin/bash
set -e

SERVER_IP="45.93.137.117"

echo "==> Building backend image..."
docker build -t cloud-chat-backend:latest ./backend

echo "==> Building frontend image..."
docker build -t cloud-chat-frontend:latest ./frontend

# k3s uses its own containerd — images must be imported separately
if command -v k3s &>/dev/null; then
  echo "==> Importing images into k3s containerd..."
  docker save cloud-chat-backend:latest  | sudo k3s ctr images import -
  docker save cloud-chat-frontend:latest | sudo k3s ctr images import -
fi

echo "==> Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/deployment.yaml

echo "==> Waiting for deployments..."
kubectl rollout status deployment/postgres       -n cloud-chat --timeout=120s
kubectl rollout status deployment/redis          -n cloud-chat --timeout=120s
kubectl rollout status deployment/cloud-chat-backend  -n cloud-chat --timeout=180s
kubectl rollout status deployment/cloud-chat-frontend -n cloud-chat --timeout=180s

echo ""
echo "Done!"
echo "  Frontend : http://$SERVER_IP:30082"
echo "  Backend  : http://$SERVER_IP:30081"
echo "  Mailhog  : http://$SERVER_IP:30825"
