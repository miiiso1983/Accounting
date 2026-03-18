#!/bin/bash
# ========== عدّل هذي المعلومات ==========
SSH_USER="master_xxxxxxxx"          # من Cloudways: Server → Master Credentials
SSH_HOST="xxx.xxx.xxx.xxx"          # IP السيرفر
SSH_PORT="22"                        # المنفذ (Cloudways عادة 22)
APP_PATH="/home/master/applications/xxxxxxxx/public_html"  # مسار التطبيق على السيرفر
# =========================================

echo "🚀 Deploying to Cloudways..."

ssh -p $SSH_PORT $SSH_USER@$SSH_HOST << EOF
  cd $APP_PATH
  echo "📥 Pulling latest code..."
  git pull origin main
  echo "📦 Installing dependencies..."
  npm install --production=false
  echo "🔨 Building..."
  npm run build
  echo "🔄 Restarting app..."
  pm2 restart all 2>/dev/null || npx pm2 restart all 2>/dev/null || echo "⚠️  Restart manually if needed"
  echo "✅ Done!"
EOF

