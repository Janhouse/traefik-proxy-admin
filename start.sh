#!/bin/bash

echo "🚀 Starting Traefik Admin Panel..."

# Check if PostgreSQL is running
if ! docker-compose ps postgres | grep -q "Up"; then
    echo "📦 Starting PostgreSQL..."
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 5
fi

# Check if database is migrated
if [ ! -f ".migration-done" ]; then
    echo "🗄️  Setting up database..."
    pnpm db:push
    touch .migration-done
fi

echo "🌐 Starting Next.js application..."
pnpm dev