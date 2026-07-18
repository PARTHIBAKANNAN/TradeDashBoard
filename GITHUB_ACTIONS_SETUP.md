# Daily PR Setup Guide - Jules + GitHub Actions

This guide walks you through setting up automated daily PR creation with Jules API integration.

## What's Been Created

✅ **Workflow File**: `.github/workflows/daily-pr.yml`
- Runs daily at 9 AM UTC (configurable)
- Generates meaningful code improvements
- Creates a PR with changes

✅ **Script**: `scripts/generate-pr-changes.py`
- Formats Python code (Black)
- Formats JavaScript code (Prettier)
- Runs security checks
- Integrates with Jules API

## Setup Steps

### Step 1: Create GitHub Personal Access Token

1. Go to: **https://github.com/settings/tokens/new**
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Fill in details:
   - **Note**: `TradeDashBoard Daily PR Bot`
   - **Expiration**: 90 days (or your preference)
   - **Scopes**: Select these checkboxes:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `workflow` (Update GitHub Actions workflows)
     - ✅ `read:user` (Read user profile)

4. Click **"Generate token"**
5. **Copy the token immediately** (you won't see it again!)

### Step 2: Add GitHub Secrets

1. Go to your repo: **https://github.com/PARTHIBAKANNAN/TradeDashBoard**
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**

#### Add Secret #1: GITHUB_TOKEN
- **Name**: `GITHUB_TOKEN`
- **Value**: Paste the token you created in Step 1
- Click **"Add secret"**

#### Add Secret #2: JULES_API_KEY
- **Name**: `JULES_API_KEY`
- **Value**: Paste your Jules API key (starts with `AQ.`)
- Click **"Add secret"**

### Step 3: Configure Workflow Schedule (Optional)

If you want to change the run time, edit `.github/workflows/daily-pr.yml`:

```yaml
schedule:
  - cron: '0 9 * * *'  # Current: 9 AM UTC daily
```

**Cron Format**: `minute hour day month weekday`

Examples:
- `0 8 * * *` = 8 AM UTC
- `0 14 * * *` = 2 PM UTC
- `0 9 * * 1-5` = Weekdays only (Mon-Fri)

### Step 4: Enable GitHub Actions

1. Go to your repo → **Actions** tab
2. You should see "Daily Meaningful PR" workflow
3. If it says "Actions disabled", click **"Enable Actions"**

### Step 5: Test the Workflow

**Option A: Manual Trigger**
1. Go to **Actions** → **Daily Meaningful PR**
2. Click **"Run workflow"** → **"Run workflow"**
3. Watch the logs and verify it works

**Option B: Wait for Schedule**
- The workflow will run automatically at 9 AM UTC tomorrow
- Check **Actions** tab to see execution history

## What the Daily PR Does

When the workflow runs, it will:

1. ✨ **Format Code**
   - Black formatting for Python
   - Prettier formatting for JavaScript/React

2. 🔍 **Lint Code**
   - flake8 for Python
   - ESLint for JavaScript

3. 🛡️ **Security Checks**
   - Safety library check for Python dependencies

4. 🔄 **Dependency Audit**
   - Checks Python requirements
   - Checks Node.js packages

5. 🔮 **Jules API Integration**
   - Analyzes code for refactoring opportunities
   - Suggests best practices improvements
   - Security recommendations

6. 📝 **Create PR**
   - Commits all changes with descriptive message
   - Opens a new PR titled "🤖 Daily PR: Code improvements and maintenance"
   - Auto-labels with `automated` and `daily-maintenance`

## Monitoring

### Check Workflow Status
1. Go to repo → **Actions** tab
2. Click **"Daily Meaningful PR"**
3. View recent runs and their logs

### View Generated PRs
1. Go to repo → **Pull Requests** tab
2. Filter by label: `automated`
3. Review the changes and merge if satisfied

### Troubleshooting

**No PR created?**
- Check if workflow ran successfully in Actions tab
- Verify secrets are set correctly
- Check workflow logs for error messages

**"Permission denied" error?**
- Verify GITHUB_TOKEN has `repo` and `workflow` scopes
- Token might have expired

**Jules API not working?**
- Verify JULES_API_KEY is correct
- Check workflow logs for API errors
- Jules API integration might need endpoint adjustment

**Too many/few changes?**
- Edit `scripts/generate-pr-changes.py` to enable/disable specific checks
- Adjust Python/JS paths if needed

## Customization

### Change PR Labels
Edit `.github/workflows/daily-pr.yml`:
```yaml
labels: "automated,daily-maintenance,your-label-here"
```

### Disable Specific Checks
Edit `scripts/generate-pr-changes.py` and comment out functions like:
- `format_python_code()` - Disable Python formatting
- `check_security()` - Disable security checks
- `call_jules_api()` - Disable Jules analysis

### Adjust Code Paths
If your code is in different directories, update `scripts/generate-pr-changes.py`:
```python
python_paths = [
    str(REPO_ROOT / "your_python_dir"),
]
```

## Next Steps

1. ✅ Complete the setup steps above
2. ✅ Test with manual trigger
3. ✅ Wait for tomorrow's 9 AM UTC run
4. ✅ Review PRs and merge quality improvements
5. ✅ Keep GitHub activity tab active! 🎉

## Support

For issues with:
- **GitHub Actions**: Check GitHub Actions documentation
- **Jules API**: Review Jules API docs and API key validity
- **Code formatting**: Check Black and Prettier documentation

---

**Note**: The automated token includes read/write access to your repo. Keep it secure and rotate regularly (GitHub recommends 90 days).
