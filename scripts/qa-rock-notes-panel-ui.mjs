#!/usr/bin/env node
// Exercises the actual RockNotesPanel UI against the run-scoped QA fixture.
// It uses only existing login storage states and the allowlisted QA dev server.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const ORIGIN = 'http://localhost:8080';
const QA_PROJECT_REF = 'qfpxvumcrnzrjyvqkicq';

export function validatePanelRunConfig(env, runId, rockId) {
  ensure(env.QA_SUPABASE_PROJECT_REF === QA_PROJECT_REF, 'Refusing panel test outside the allowlisted QA project');
  ensure(env.VITE_SUPABASE_URL === `https://${QA_PROJECT_REF}.supabase.co`, 'Refusing panel test against a non-QA app URL');
  ensure(/^\d+-\d+$/.test(runId), 'Refusing panel test without a run-scoped workflow id');
  ensure(/^[0-9a-f-]{36}$/i.test(rockId), 'Refusing panel test without a Rock UUID');
  return { projectRef: QA_PROJECT_REF, runId, rockId };
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'unknown failure';
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-token]');
}

function noteItem(page, body) {
  return page
    .getByRole('list', { name: 'Notes, newest first' })
    .getByRole('listitem')
    .filter({ hasText: body })
    .first();
}

async function openPanel(browser, statePath, role, { title, rockId, runId }) {
  const storageState = JSON.parse(readFileSync(statePath, 'utf8'));
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const url = new URL('/e2e/qa/rock-notes-panel-harness.html', ORIGIN);
  url.searchParams.set('rockId', rockId);
  url.searchParams.set('runId', runId);
  const response = await page.goto(url.toString());
  ensure(response?.ok(), `${role} panel harness returned HTTP ${response?.status() ?? 'no response'}`);
  await expect(page.getByTestId('fixture-title')).toHaveText(title, { timeout: 30_000 });
  await expect(page.getByTestId('actor-role')).toHaveText(role);
  const panel = page.getByRole('region', { name: 'Notes' });
  await expect(panel.getByRole('textbox', { name: `Note for ${title}` })).toBeVisible();
  return { context, page, panel, pageErrors };
}

async function expectNoBrowserErrors(pageErrors, role) {
  expect(pageErrors, `${role} panel page errors`).toEqual([]);
}

async function editNote(page, currentBody, nextBody) {
  const item = noteItem(page, currentBody);
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Edit note' }).click();
  const editor = item.getByRole('textbox', { name: /Edit note/ });
  await editor.fill(nextBody);
  await item.getByRole('button', { name: 'Save changes' }).click();
  await expect(noteItem(page, nextBody)).toBeVisible();
}

async function deleteNote(page, body) {
  const item = noteItem(page, body);
  await expect(item).toBeVisible();
  await item.getByRole('button', { name: 'Delete note' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText('Delete this Rock note?')).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete note' }).click();
  await expect(noteItem(page, body)).toHaveCount(0);
}

export async function verifyRockNotesPanelUi({ stateDirectory, runId, rockId, title, bodies, authorRole = 'Team Member' }) {
  validatePanelRunConfig(process.env, runId, rockId);

  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  try {
    const author = await openPanel(browser, join(stateDirectory, 'tom-csc.json'), authorRole, { title, rockId, runId });
    contexts.push(author.context);
    const authorList = author.page.getByRole('list', { name: 'Notes, newest first' });
    await expect(authorList.getByText(bodies.author)).toBeVisible();
    await expect(authorList.getByText(bodies.adminTarget)).toBeVisible();
    await expect(author.panel.getByRole('button', { name: 'Edit note' })).toHaveCount(2);

    await editNote(author.page, bodies.author, bodies.authorUiEdited);
    const authorEditor = author.panel.getByRole('textbox', { name: `Note for ${title}` });
    await authorEditor.fill(bodies.uiAdded);
    await author.panel.getByRole('button', { name: 'Add note' }).click();
    await expect(noteItem(author.page, bodies.uiAdded)).toBeVisible();
    await deleteNote(author.page, bodies.uiAdded);
    await deleteNote(author.page, bodies.authorUiEdited);
    expectNoBrowserErrors(author.pageErrors, authorRole);

    const nonAuthor = await openPanel(browser, join(stateDirectory, 'tom-integrator.json'), 'Integrator', { title, rockId, runId });
    contexts.push(nonAuthor.context);
    await expect(noteItem(nonAuthor.page, bodies.adminTarget)).toBeVisible();
    await expect(nonAuthor.panel.getByRole('button', { name: 'Edit note' })).toHaveCount(0);
    await expect(nonAuthor.panel.getByRole('button', { name: 'Delete note' })).toHaveCount(0);
    expectNoBrowserErrors(nonAuthor.pageErrors, 'Integrator');

    const superAdmin = await openPanel(browser, join(stateDirectory, 'qa-superadmin.json'), 'Super Admin', { title, rockId, runId });
    contexts.push(superAdmin.context);
    await expect(noteItem(superAdmin.page, bodies.adminTarget)).toBeVisible();
    await expect(superAdmin.panel.getByRole('button', { name: 'Edit note' })).toHaveCount(1);
    await editNote(superAdmin.page, bodies.adminTarget, bodies.adminUiEdited);
    await deleteNote(superAdmin.page, bodies.adminUiEdited);
    expectNoBrowserErrors(superAdmin.pageErrors, 'Super Admin');
  } catch (error) {
    throw new Error(`Rendered Rock Notes panel verification failed for run ${runId}: ${safeError(error)}`);
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
}
