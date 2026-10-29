# RouteMate
Pretend I put setup instructions here

## Setup
# Frontend
npm create vite@latest client -- --template react
cd client
npm install
npm install react-router-dom leaflet react-leaflet
cd ..

# Backend
mkdir server && cd server
npm init -y
npm install express cors better-sqlite3 bcryptjs jsonwebtoken dotenv
npm install -D nodemon
cd ..
