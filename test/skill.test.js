import assert from "node:assert/strict";
import test from "node:test";

import { createHomeOutput } from "../src/cli.js";
import { SKILL_DESCRIPTION, createSkillMarkdown } from "../src/skill.js";

// LOCAL PATCH: upstream rewrites every command into the `npx -y lavish-axi` form. This install
// is `npm link`-ed from the checkout, so npx would fetch the UNPATCHED package from npm and
// silently undo every patch in this fork. Commands pass through unchanged; see the
// "never routes commands through npx" test below for the guard that matters.
function skillCommandText(text) {
  return text;
}

test("createSkillMarkdown emits valid frontmatter naming the lavish skill", () => {
  const md = createSkillMarkdown();
  assert.ok(md.startsWith("---\n"), "starts with frontmatter fence");
  const end = md.indexOf("\n---\n", 4);
  assert.ok(end > 0, "frontmatter is closed");
  const frontmatter = md.slice(4, end);
  assert.match(frontmatter, /^name: lavish$/m);
  assert.match(frontmatter, /^description: /m);
  assert.match(frontmatter, /^argument-hint: /m);
  assert.ok(frontmatter.includes(SKILL_DESCRIPTION), "frontmatter carries the skill description");
});

test("createSkillMarkdown emits Hermes Agent metadata in frontmatter", () => {
  const md = createSkillMarkdown();
  const frontmatter = md.slice(4, md.indexOf("\n---\n", 4));

  assert.match(frontmatter, /^author: Kun Chen \(kunchenguid\)$/m);
  assert.match(frontmatter, /^metadata:\n {2}hermes:\n {4}tags: \[[^\]]+\]\n {4}category: \S+$/m);
  assert.doesNotMatch(frontmatter, /^version:/m, "version is omitted to avoid release churn");
});

test("createSkillMarkdown handles explicit /lavish invocation arguments", () => {
  const md = createSkillMarkdown();
  const body = md.slice(md.indexOf("\n---\n", 4) + 5);

  assert.ok(body.includes("$ARGUMENTS"), "body consumes slash-command arguments");
  assert.match(body, /empty/i, "explains the model-invoked case where no arguments are passed");
});

test("createSkillMarkdown mirrors the no-args home output", () => {
  const md = createSkillMarkdown();
  const home = createHomeOutput({ bin: "lavish-axi", sessions: [], includeSessions: false, agent: "static" });

  assert.ok(md.includes(skillCommandText(home.description)), "includes the product description");

  for (const item of home.visual_guidance) {
    assert.ok(md.includes(item), `includes visual guidance: ${item.slice(0, 32)}...`);
  }

  for (const playbook of home.playbooks) {
    assert.ok(md.includes(playbook.id), `includes playbook id: ${playbook.id}`);
    assert.ok(md.includes(playbook.use_when), `includes playbook use_when: ${playbook.id}`);
  }

  for (const item of home.help) {
    const skillItem = skillCommandText(item);
    assert.ok(md.includes(skillItem), `includes help: ${skillItem.slice(0, 32)}...`);
  }
});

test("createSkillMarkdown requires an observable wake path for every poll", () => {
  const md = createSkillMarkdown();
  const workflow = md.slice(md.indexOf("## Workflow"), md.indexOf("## Visual guidance"));

  assert.match(workflow, /Keep .*poll in the foreground by default.*return the feedback directly to the agent/i);
  assert.match(workflow, /harness-native tracked background-job facility/i);
  assert.match(workflow, /completion result is guaranteed to resume or notify the same agent/i);
  assert.match(workflow, /Never use `nohup`/);
  assert.match(workflow, /shell `&`/);
  assert.match(workflow, /`disown`/);
  assert.match(workflow, /redirected fire-and-forget processes/);
  assert.match(workflow, /detached terminal without an explicit verified callback/);
  assert.match(
    workflow,
    /If the harness has no completion-aware background facility, use the foreground poll or first wire a verified wake callback into the surrounding supervisor/i,
  );
  assert.match(workflow, /Do not tell the user the artifact is being monitored until that wake path is live/i);
  assert.match(workflow, /`Send & End` ends the session.*final feedback is still delivered once.*polling stops/i);
  assert.match(workflow, /(?:do|must) not reopen (?:it|the session) uninvited/i);
  assert.match(workflow, /queued feedback is never lost/);
  assert.doesNotMatch(md, /Codex detected/);
});

test("createSkillMarkdown keeps layout detection passive", () => {
  const md = createSkillMarkdown();

  assert.match(md, /layout issues are filed passively/);
  assert.match(md, /ordinary `layout-warnings` prompt only when the user selects and queues them/);
  assert.doesNotMatch(md, /returned as `layout_warnings`/);
  assert.doesNotMatch(md, /If poll returns `layout_warnings`/);
});

test("createSkillMarkdown requires opening every matching playbook", () => {
  const md = createSkillMarkdown();
  const playbooksSection = md.slice(md.indexOf("## Playbooks"), md.indexOf("## Commands & rules"));

  assert.ok(playbooksSection.includes("combines several playbooks"), "explains artifacts span playbooks");
  assert.ok(playbooksSection.includes("MUST open each matching playbook"), "requires opening matching playbooks");
  assert.ok(playbooksSection.includes("do not hand-build boxes-and-arrows"), "names the diagram anti-pattern");
});

test("createSkillMarkdown does not leak live session state", () => {
  const md = createSkillMarkdown();
  assert.ok(!md.includes("pending_prompts"), "no session bookkeeping fields");
  assert.ok(!/\/session\/[0-9a-f]{8}/.test(md), "no live session URLs");
});

test("createSkillMarkdown omits setup hooks guidance", () => {
  const md = createSkillMarkdown();
  assert.doesNotMatch(md, /setup hooks/);
});

// LOCAL PATCH: this is the single most load-bearing patch in the fork. Every other patch lives
// in this checkout's dist; one `npx -y` anywhere in the skill sends the agent to the published
// package instead, and the artifact silently lands in the repo, styled from a CDN, with sharing
// live again. The failure is invisible - it still works, just unpatched.
test("createSkillMarkdown never routes commands through npx", () => {
  const md = createSkillMarkdown();

  // No command in the skill may be an npx invocation. The one permitted mention of the word is
  // the prohibition itself, which is asserted below.
  assert.doesNotMatch(md, /`npx/);
  assert.doesNotMatch(md, /npx -y/);
  assert.match(md, /`npm link`-ed from a git checkout/);
  assert.match(md, /Always invoke the bare `lavish-axi \.\.\.` command/);
  assert.match(md, /NEVER run it through npx/);
  assert.match(md, /Run `lavish-axi <html-file>` to open or resume a review session/);
  assert.match(md, /Run `lavish-axi end <html-file>` when the review is finished/);
});

// LOCAL PATCH: the artifact must never land in the working directory or any git repo.
test("createSkillMarkdown puts artifacts in /tmp, never in the working directory", () => {
  const md = createSkillMarkdown();

  assert.match(md, /default location `\/tmp\/<name>\.html`/);
  assert.match(md, /never inside the project working directory or any git repo/);
  assert.doesNotMatch(md, /default location `\.lavish\//);
});
