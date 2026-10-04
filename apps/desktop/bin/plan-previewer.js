#!/usr/bin/env node
// Compatibility shim: the Plan Previewer CLI now lives in the plan-previewer module. Kept so existing
// `npm link` / global installs of @hive/desktop keep working.
import "../../../modules/plan-previewer/bin/plan-previewer.js";
