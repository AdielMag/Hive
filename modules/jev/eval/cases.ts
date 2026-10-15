import type { EvalCase } from "./metrics.ts";

export const EVAL_CASES: EvalCase[] = [
  // 1. Bug: off-by-one in loop
  {
    id: "off-by-one-loop",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or regression?",
      true_means: "A bug, flaw, or out-of-bounds error is introduced.",
      false_means: "The change is safe and correct.",
    },
    state: {
      diff: `--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,3 +10,3 @@ export function sum(items: number[]): number {
   let total = 0;
-  for (let i = 0; i < items.length; i++) {
+  for (let i = 0; i <= items.length; i++) {
     total += items[i];`,
    },
  },
  // 2. Clean: standard refactor to for...of
  {
    id: "clean-refactor-loop",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or regression?",
    },
    state: {
      diff: `--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,4 +10,4 @@ export function sum(items: number[]): number {
   let total = 0;
-  for (let i = 0; i < items.length; i++) {
-    total += items[i];
+  for (const item of items) {
+    total += item;
   }`,
    },
  },
  // 3. Bug: missing await in async function
  {
    id: "missing-await",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or regression?",
    },
    state: {
      diff: `--- a/src/db.ts
+++ b/src/db.ts
@@ -15,3 +15,3 @@ export async function saveUser(user: User): Promise<void> {
   validate(user);
-  await database.users.insert(user);
+  database.users.insert(user);
 }`,
    },
  },
  // 4. Clean: adding early return guard
  {
    id: "clean-early-return",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or regression?",
    },
    state: {
      diff: `--- a/src/service.ts
+++ b/src/service.ts
@@ -5,2 +5,3 @@ export function processItem(item: Item | null): string {
+  if (!item) return "";
   return item.name.trim();`,
    },
  },
  // 5. Bug: inverted boolean condition
  {
    id: "inverted-condition",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or regression?",
    },
    state: {
      diff: `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -20,3 +20,3 @@ export function canAccess(user: User): boolean {
-  return user.isAdmin || user.hasPermission("read");
+  return !user.isAdmin || user.hasPermission("read");
 }`,
    },
  },
  // 6. Clean: formatting and comment update
  {
    id: "clean-comment-update",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or regression?",
    },
    state: {
      diff: `--- a/src/config.ts
+++ b/src/config.ts
@@ -1,3 +1,3 @@
-// old config
+// Updated config defaults for production
 export const PORT = 8080;`,
    },
  },
  // 7. Security: path traversal vulnerability
  {
    id: "path-traversal",
    tag: "security",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a security vulnerability or bug?",
    },
    state: {
      diff: `--- a/src/files.ts
+++ b/src/files.ts
@@ -10,3 +10,3 @@ export function readUserFile(filename: string): string {
-  const safePath = path.join("/var/data", path.basename(filename));
+  const safePath = path.join("/var/data", filename);
   return fs.readFileSync(safePath, "utf8");`,
    },
  },
  // 8. Clean: use path.resolve with boundary check
  {
    id: "clean-path-boundary",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or security issue?",
    },
    state: {
      diff: `--- a/src/files.ts
+++ b/src/files.ts
@@ -10,3 +10,5 @@ export function readUserFile(filename: string): string {
   const safePath = path.resolve("/var/data", filename);
+  if (!safePath.startsWith("/var/data/")) throw new Error("Unauthorized path");
   return fs.readFileSync(safePath, "utf8");`,
    },
  },
  // 9. Bug: swallowed error losing context
  {
    id: "swallowed-error",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or problem?",
    },
    state: {
      diff: `--- a/src/api.ts
+++ b/src/api.ts
@@ -12,4 +12,4 @@ export async function fetchData(): Promise<Data> {
   try {
     return await client.fetch();
-  } catch (err) {
-    throw new ApiError("Failed to fetch", { cause: err });
+  } catch {
+    return null as any;
   }`,
    },
  },
  // 10. Clean: type signature refinement
  {
    id: "clean-type-refine",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or regression?",
    },
    state: {
      diff: `--- a/src/types.ts
+++ b/src/types.ts
@@ -5,3 +5,3 @@ export interface ApiResponse {
-  data: any;
+  data: Record<string, unknown>;
   status: number;`,
    },
  },
  // 11. Bug: missing dependency in React useEffect hook
  {
    id: "missing-useeffect-dep",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a React hook bug or stale closure?",
    },
    state: {
      diff: `--- a/src/Component.tsx
+++ b/src/Component.tsx
@@ -14,4 +14,4 @@ export function Profile({ userId, onUpdate }: Props) {
   useEffect(() => {
     fetchProfile(userId).then(onUpdate);
-  }, [userId, onUpdate]);
+  }, [userId]);`,
    },
  },
  // 12. Clean: React hook callback memoization
  {
    id: "clean-usecallback",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug?",
    },
    state: {
      diff: `--- a/src/Component.tsx
+++ b/src/Component.tsx
@@ -8,3 +8,3 @@ export function Button({ onClick }: Props) {
-  const handleClick = () => onClick();
+  const handleClick = useCallback(() => onClick(), [onClick]);
   return <button onClick={handleClick} />;`,
    },
  },
  // 13. Bug: strict equality check with NaN
  {
    id: "nan-strict-equality",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug or logical defect?",
    },
    state: {
      diff: `--- a/src/math.ts
+++ b/src/math.ts
@@ -4,3 +4,3 @@ export function isValidNumber(val: number): boolean {
-  return !Number.isNaN(val) && Number.isFinite(val);
+  return val !== NaN && Number.isFinite(val);
 }`,
    },
  },
  // 14. Clean: Number.isFinite check
  {
    id: "clean-finite-check",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug?",
    },
    state: {
      diff: `--- a/src/math.ts
+++ b/src/math.ts
@@ -4,3 +4,3 @@ export function isValidNumber(val: number): boolean {
-  return typeof val === "number";
+  return typeof val === "number" && Number.isFinite(val);
 }`,
    },
  },
  // 15. Bug: event listener memory leak (listener added on every render without cleanup)
  {
    id: "event-listener-leak",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a memory leak or bug?",
    },
    state: {
      diff: `--- a/src/window.ts
+++ b/src/window.ts
@@ -10,5 +10,4 @@ export function attachResize(handler: () => void) {
   window.addEventListener("resize", handler);
-  return () => window.removeEventListener("resize", handler);
+  // permanent listener
 }`,
    },
  },
  // 16. Clean: proper event listener cleanup
  {
    id: "clean-listener-cleanup",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug?",
    },
    state: {
      diff: `--- a/src/window.ts
+++ b/src/window.ts
@@ -10,3 +10,5 @@ export function useResize(handler: () => void) {
   useEffect(() => {
     window.addEventListener("resize", handler);
+    return () => window.removeEventListener("resize", handler);
   }, [handler]);`,
    },
  },
  // 17. Log evaluation: test failure
  {
    id: "log-test-failure",
    tag: "log-fail",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this build or test output contain a failure or error?",
      true_means: "There is an error, failure, or crash.",
      false_means: "All tests and builds passed successfully.",
    },
    state: {
      output: `FAIL src/auth.test.ts
  ✕ should authenticate valid token (45 ms)
    AssertionError: expected false to be true
      at Object.<anonymous> (src/auth.test.ts:24:18)

Test Files  1 failed, 3 passed (4)
Tests       1 failed, 12 passed (13)`,
    },
  },
  // 18. Log evaluation: test pass
  {
    id: "log-test-pass",
    tag: "log-pass",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this build or test output contain a failure or error?",
    },
    state: {
      output: `Test Files  4 passed (4)
Tests       13 passed (13)
Duration    1.24s
Done in 2.10s.`,
    },
  },
  // 19. Bug: JSON.parse on unsanitized string without try-catch in critical path
  {
    id: "json-parse-crash",
    tag: "bug",
    label: true,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce an unhandled crash or exception bug?",
    },
    state: {
      diff: `--- a/src/storage.ts
+++ b/src/storage.ts
@@ -8,5 +8,3 @@ export function getCached<T>(key: string): T | null {
   const raw = localStorage.getItem(key);
   if (!raw) return null;
-  try {
-    return JSON.parse(raw);
-  } catch { return null; }
+  return JSON.parse(raw);
 }`,
    },
  },
  // 20. Clean: safe JSON.parse helper
  {
    id: "clean-safe-parse",
    tag: "clean",
    label: false,
    question: {
      type: "noul",
      instructions: "Does this code diff introduce a bug?",
    },
    state: {
      diff: `--- a/src/storage.ts
+++ b/src/storage.ts
@@ -8,3 +8,7 @@ export function getCached<T>(key: string): T | null {
   const raw = localStorage.getItem(key);
-  return raw ? JSON.parse(raw) : null;
+  if (!raw) return null;
+  try {
+    return JSON.parse(raw);
+  } catch {
+    return null;
+  }`,
    },
  },
];
