> **⚠️ SUPERSEDED — do not treat as current.** This is a point-in-time snapshot from
> 2026-09-30 that predates later config changes. Since then: **SonarQube was disabled**
> (approved — not needed for a Next.js + PostgreSQL project), and the **global Playwright MCP command
> was corrected** to `npx -y @playwright/mcp@latest` in
> `~/.config/opencode/opencode.json`. The **global PostgreSQL MCP is still wrong** — it
> launches `npx -y postgresql`, which is not the Postgres MCP server, and remains unfixed.
>
> **Added 2026-10-05:** the ORM-specific MCP row that was listed here has been **removed** from
> `~/.config/opencode/opencode.json`; it was irrelevant to a Drizzle-based data layer.
> For the current authoritative state see **`MEMORY.md` §14 (Agent + skills landscape)**.

# MCP Health Report - scholars-student-managment-system

**OpenCode Version**: 1.18.33  
**Generated**: 2026-09-30  
**Project**: `/home/zeeshan/Downloads/scholars-student-managment-system`

---

## MCP Health Summary

| MCP | Status | Root Cause | Auto-Fixed | User Action |
|-----|--------|------------|------------|-------------|
| codebase-memory-mcp | ✅ WORKING | Local MCP, connected via `/home/zeeshan/.local/bin/codebase-memory-mcp` | N/A | None |
| context7 | ✅ WORKING | Remote MCP at `https://mcp.context7.com/mcp` | N/A | None |
| sentry | ✅ WORKING | Remote MCP with OAuth, authenticated | N/A | None |
| github | ✅ WORKING | Local MCP via `npx -y github-mcp` | N/A | None |
| next-devtools | ✅ WORKING | Local MCP via `npx -y next-devtools-mcp@latest` | N/A | None |
| motion | ✅ WORKING | Remote MCP at `https://mcp.motion.dev` | N/A | None |
| motion-plus | ✅ WORKING | Remote MCP at `https://mcp.motion.dev/plus` (OAuth, has valid token) | N/A | None |
| sonarqube | ❌ CONFIGURATION REQUIRED | `SONARQUBE_TOKEN` env var required by MCP server code | **YES** - Fixed `SONARQUBE_URL` value | Obtain `SONARQUBE_TOKEN` from SonarQube server |
| playwright | ❌ CONFIGURATION ISSUE | `npx -y playwright` fails; MCP package connection closed | N/A | Investigate playwright MCP setup |
| postgresql | ❌ CONFIGURATION ISSUE | `npx -y postgresql` fails; npm package `postgresql` does not exist | N/A | Remove or replace with valid package |

---

## Automatically Fixed Issues

### 1. SonarQube MCP `SONARQUBE_URL` Configuration

**Problem**: In `opencode.json`, the sonarqube MCP command had `-e SONARQUBE_URL` without a value, causing the Docker container to fail with:
```
java.lang.IllegalArgumentException: SONARQUBE_URL or SONARQUBE_ORG must be set
```

**Fix Applied**: Changed `SONARQUBE_URL` to `SONARQUBE_URL=http://localhost:9000` in the command array.

**File Modified**: `opencode.json` (line 14)

**Before**:
```json
"-e",
"SONARQUBE_URL",
```

**After**:
```json
"-e",
"SONARQUBE_URL=http://localhost:9000",
```

**Verification**: After the fix, the MCP list shows:
- sonarqube error changed from "SONARQUBE_URL or SONARQUBE_ORG must be set" to "SONARQUBE_TOKEN environment variable or property must be set"

---

## User Action Required Issues

### 1. SonarQube MCP - `SONARQUBE_TOKEN` Required

**Why it failed**: The SonarQube MCP server (`sonarsource/sonarqube-mcp`) requires a `SONARQUBE_TOKEN` environment variable as a hard requirement in its startup code (`McpServerLaunchConfiguration.java:177`). This cannot be faked or omitted.

**What the user needs to do**:
1. Obtain a SonarQube API token from your SonarQube instance:
   - Go to **Administration > Security > Users** 
   - Select your user or create a dedicated service user
   - Generate an API token
2. Add the token to OpenCode using one of these methods:
   - **Method A**: Add to `.env` file (OpenCode loads `.env` automatically):
     ```
     SONARQUBE_TOKEN=your-token-here
     ```
   - **Method B**: Export as environment variable: `export SONARQUBE_TOKEN=your-token-here`
3. Restart OpenCode to pick up the new environment variable:
   ```bash
   opencode mcp list
   ```
4. Verify the MCP connects:
   ```bash
   opencode mcp list  # Should show sonarqube as connected (or auth required)
   ```

**Verification method**:
```bash
opencode mcp list  # sonarqube should show as connected or auth status
```

**Note**: The SonarQube server must be running and accessible at the configured URL (`http://localhost:9000` by default). If you don't have a SonarQube instance, this MCP cannot be made to work without one.

---

### 2. Playwright MCP - Package Connection Issue

**Problem**: The `playwright` MCP fails with error `-32000: Connection closed` when trying to run `npx -y playwright`. Investigation shows:

- The `@playwright/test` package is installed as a dependency (devDependency)
- Running `npx -y playwright` works as a CLI tool (`playwright open`, `playwright install`, etc.)
- However, the MCP server integration for playwright is not functioning correctly
- The error suggests the MCP subprocess is crashing or failing to initialize

**What the user needs to do**:
1. Verify if the playwright MCP is needed for your workflow
2. If playwright MCP is required:
   - Check if there's a newer version of the playwright MCP package
   - Ensure `@playwright/test` is properly installed: `npm install -D @playwright/test`
   - Try re-installing the MCP: `opencode mcp logout playwright && opencode mcp add playwright --type local --command "npx -y playwright"`
3. If playwright MCP is not essential, you can disable it or remove it from MCP configuration

**Verification method**:
```bash
# Test if playwright CLI works
npx playwright --version

# Test MCP status
opencode mcp list  # Check if playwright status changes
```

**Note**: The root cause may be that the playwright MCP server script or initialization code is not compatible with the installed version of `@playwright/test`. This may require waiting for an updated MCP package or filing an issue with the OpenCode maintainers.

---

### 3. PostgreSQL MCP - Invalid Package Name

**Problem**: The `postgresql` MCP fails with error `-32000: Connection closed` when trying to run `npx -y postgresql`. Investigation reveals:

- **No npm package named `postgresql` exists**
- The `postgresql` package was likely added to MCP configuration erroneously
- npm returns an error when trying to install `postgresql`

**What the user needs to do**:
1. **If you need PostgreSQL MCP functionality**:
   - Use a different MCP that connects to PostgreSQL, or
   - Install and configure a PostgreSQL-related MCP package if one exists
2. **If you don't need PostgreSQL MCP**:
   - Simply remove it from consideration - it's not essential for this project
3. **Alternative**: If you need database introspection, the `db` client exported from `src/db/client.ts` and `drizzle-kit`'s `introspect` (`pnpm db:introspect`) already cover schema exploration.

**Verification method**:
```bash
# Confirm the package doesn't exist
npm view postgresql 2>&1 | head -5

# Check MCP status
opencode mcp list  # postgresql should show as failed
```

**Note**: This is a configuration error - the `postgresql` MCP should not have been added to the configuration since the npm package does not exist. It should be removed or replaced with a valid alternative.

---

## Verification Performed

All 11 MCP servers were tested using `opencode mcp list` and `opencode mcp debug <name>`:

1. **codebase-memory-mcp**: Connected ✓ - Local MCP server at `/home/zeeshan/.local/bin/codebase-memory-mcp`
2. **context7**: Connected ✓ - Remote MCP at `https://mcp.context7.com/mcp`
3. **sentry**: Connected ✓ (OAuth) - Remote MCP at `https://mcp.sentry.dev/mcp`
4. **github**: Connected ✓ - Local MCP via `npx -y github-mcp`
5. **next-devtools**: Connected ✓ - Local MCP via `npx -y next-devtools-mcp@latest`
6. **motion**: Connected ✓ - Remote MCP at `https://mcp.motion.dev`
7. **motion-plus**: Connected ✓ - Remote MCP at `https://mcp.motion.dev/plus` (OAuth with valid token)
8. **sonarqube**: Fixed `SONARQUBE_URL`, now requires `SONARQUBE_TOKEN`
9. **playwright**: Failed - `npx -y playwright` connection closed
11. **postgresql**: Failed - npm package `postgresql` does not exist

---

## Configuration Changes Summary

**File modified**: `opencode.json`

**Change 1**: Fixed sonarqube MCP `SONARQUBE_URL` value
- Changed from bare `SONARQUBE_URL` to `SONARQUBE_URL=http://localhost:9000`

**No other configuration changes were automatically applied**, as the remaining issues require:
- User-provided secrets (`SONARQUBE_TOKEN`)
- Package/repository fixes (`postgresql`, `playwright`)
- External service availability (SonarQube instance)

## Remaining Issues Requiring Attention

| Issue | Priority | Action |
|-------|----------|--------|
| SonarQube `SONARQUBE_TOKEN` | High | User to obtain token and configure via `.env` or environment variable |
| Playwright MCP stability | Medium | Investigate or remove if not essential |
| PostgreSQL MCP invalid package | Low | Remove or replace with valid alternative |

---