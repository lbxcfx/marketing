#!/bin/bash

echo "Starting Postiz Services..."

# Start Docker containers (Postgres, Redis, Temporal)
echo "Starting Docker containers..."
docker-compose -f docker-compose.dev.yaml up -d


# Start Postiz Backend in background
echo "Starting Backend..."
pnpm --filter ./apps/backend run dev &

# Start Postiz Frontend in background
echo "Starting Frontend..."
pnpm --filter ./apps/frontend run dev &

# Start Postiz Orchestrator in background
echo "Starting Orchestrator..."
pnpm --filter ./apps/orchestrator run dev &

# Start Social Auto Upload in background
echo "Starting Social Auto Upload..."
(cd social-auto-upload-main/social-auto-upload-main && python sau_backend.py) &

# Wait for all background processes to finish (if you ctrl+c, it should stop them)
wait
