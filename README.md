apt update  
apt upgrade  
apt install git  
git clone this repo
cd atteny-backend

# pocketbase
cd pb  
wget pocketbase  
unzip pocketbase.zip  
rm pocketbase.zip  
nano /lib/systemd/system/pocketbase.service
```
    [Unit]
    Description = pocketbase

    [Service]
    Type             = simple
    User             = root
    Group            = root
    LimitNOFILE      = 4096
    Restart          = always
    RestartSec       = 5s
    StandardOutput   = append:/root/atteny-backend/pb/std.log
    StandardError    = append:/root/atteny-backend/pb/std.log
    WorkingDirectory = /root/atteny-backend/pb
    ExecStart        = /root/atteny-backend/pb/pocketbase serve atteny-backend.popok.uk --origins https://atteny.popok.uk

    [Install]
    WantedBy = multi-user.target
```
cp pb_hooks/config.example pb_hooks/config.js  
nano pb_hooks/config.js

./pocketbase superuser create EMAIL PASS  
systemctl enable pocketbase  
systemctl start pocketbase

# sheet server
apt install nodejs  
curl -fsSL https://get.pnpm.io/install.sh | sh -

cd sheet-server  
pnpm install pm2 --no-save  
pnpm install  
cp .env.example .env  
nano .env  
pm2 startup  
pm2 start server.mjs