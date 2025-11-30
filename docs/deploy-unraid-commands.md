# Nano-Siege Unraid Deploy Commands

Use these two commands when you want to deploy the latest code to Unraid.

**1) From your dev machine – push to GitHub**

Run this from the repo root (after committing any changes, or using your editor’s GUI to commit):

```bash
git push origin master
```

**2) On your Unraid server – pull and deploy**

Run this from anywhere on Unraid:

```bash
cd /mnt/user/www/nano-siege-repo && git pull origin master && ./scripts/deploy-unraid.sh
```

That pulls the latest code into `/mnt/user/www/nano-siege-repo` and then deploys it into:

- Backend: `/mnt/user/www/nano-siege-backend`
- Public:  `/mnt/user/www/nano-siege`

