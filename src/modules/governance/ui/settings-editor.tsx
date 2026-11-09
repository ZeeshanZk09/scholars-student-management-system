"use client";

/**
 * System Settings Editor UI (`PRD.md` MODULE 32, `RULES.md` §37).
 *
 * Provides a category-driven interface for viewing and modifying institution configuration settings.
 * Enforces human-readable labels, clear validation errors, and audited override reasons.
 */

import * as React from "react";
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  NotePencilIcon,
  SlidersIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/shared/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { IDLE_FORM_STATE } from "@/shared/forms";

import {
  CATEGORY_METADATA,
  SETTING_CATEGORIES,
  type SettingCategory,
  type SettingChangeRecord,
} from "../domain/system-settings";
import type { EffectiveSettingView } from "../application/ports";
import {
  getSettingHistoryAction,
  overrideSettingAction,
  resetSettingAction,
} from "./actions";

export interface SettingsEditorProps {
  readonly institutionId: string;
  readonly initialSettings: readonly EffectiveSettingView[];
}

export function SettingsEditor({
  institutionId,
  initialSettings,
}: Readonly<SettingsEditorProps>) {
  const [selectedCategory, setSelectedCategory] = React.useState<SettingCategory>("institute");
  const [editingSetting, setEditingSetting] = React.useState<EffectiveSettingView | null>(null);
  const [resettingSetting, setResettingSetting] = React.useState<EffectiveSettingView | null>(null);
  const [historySetting, setHistorySetting] = React.useState<EffectiveSettingView | null>(null);
  const [historyRecords, setHistoryRecords] = React.useState<readonly SettingChangeRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(false);

  // Edit Action State
  const [overrideState, formActionOverride, isOverridePending] = React.useActionState(
    overrideSettingAction,
    IDLE_FORM_STATE,
  );

  // Reset Action State
  const [resetState, formActionReset, isResetPending] = React.useActionState(
    resetSettingAction,
    IDLE_FORM_STATE,
  );

  // Close modals upon successful submit
  React.useEffect(() => {
    if (overrideState.status === "done") {
      const timer = setTimeout(() => setEditingSetting(null), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [overrideState]);

  React.useEffect(() => {
    if (resetState.status === "done") {
      const timer = setTimeout(() => setResettingSetting(null), 1200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [resetState]);

  // Load history when modal opens
  const openHistory = async (setting: EffectiveSettingView) => {
    setHistorySetting(setting);
    setLoadingHistory(true);
    try {
      const result = await getSettingHistoryAction(institutionId, setting.key);
      if (result.ok) {
        setHistoryRecords(result.history);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredSettings = initialSettings.filter((s) => s.category === selectedCategory);
  const activeCategoryMeta = CATEGORY_METADATA[selectedCategory];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
      {/* Category Navigation */}
      <nav aria-label="Configuration Categories" className="flex flex-col gap-1.5 lg:col-span-1">
        <h2 className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Categories
        </h2>
        {SETTING_CATEGORIES.map((catKey) => {
          const meta = CATEGORY_METADATA[catKey];
          const isSelected = selectedCategory === catKey;
          return (
            <button
              key={catKey}
              type="button"
              onClick={() => setSelectedCategory(catKey)}
              className={cn(
                "flex flex-col rounded-md px-3 py-2 text-left text-xs transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground font-medium shadow-xs"
                  : "text-foreground hover:bg-muted/60",
              )}
            >
              <span className="font-medium">{meta.label}</span>
              <span
                className={cn(
                  "line-clamp-1 text-[11px]",
                  isSelected ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {meta.description}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Settings List for Selected Category */}
      <div className="flex flex-col gap-4 lg:col-span-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <SlidersIcon className="size-4 text-primary" weight="bold" />
            <h3 className="text-sm font-semibold">{activeCategoryMeta.label}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{activeCategoryMeta.description}</p>
        </div>

        <div className="flex flex-col gap-3">
          {filteredSettings.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-xs text-muted-foreground">
              No configuration items found in this category.
            </div>
          ) : (
            filteredSettings.map((setting) => (
              <Card key={setting.key} className="overflow-hidden">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-sm font-medium">{setting.label}</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        {setting.description}
                      </CardDescription>
                      <span className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {setting.key}
                      </span>
                    </div>
                    <div>
                      {setting.isOverridden ? (
                        <StatusBadge tone="warning">Customized</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">System Default</StatusBadge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <div className="flex items-center justify-between border-t pt-3">
                    <div>
                      <span className="text-[11px] text-muted-foreground">Current Value:</span>
                      <p className="text-sm font-semibold text-foreground">
                        {setting.displayValue || "—"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openHistory(setting)}
                        className="h-8 gap-1 text-xs"
                      >
                        <ClockCounterClockwiseIcon className="size-3.5" />
                        History
                      </Button>

                      {setting.isOverridden && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setResettingSetting(setting)}
                          className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <ArrowCounterClockwiseIcon className="size-3.5" />
                          Restore
                        </Button>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setEditingSetting(setting)}
                        className="h-8 gap-1 text-xs"
                      >
                        <NotePencilIcon className="size-3.5" />
                        Modify
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Override / Customize Dialog */}
      {editingSetting && (
        <Dialog open={true} onOpenChange={(open) => !open && setEditingSetting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Customize {editingSetting.label}</DialogTitle>
              <DialogDescription className="text-xs">
                Modifications are recorded to the immutable audit trail with your authorized reason.
              </DialogDescription>
            </DialogHeader>

            <form action={formActionOverride} className="flex flex-col gap-4">
              <input type="hidden" name="institutionId" value={institutionId} />
              <input type="hidden" name="settingKey" value={editingSetting.key} />
              <input type="hidden" name="settingCategory" value={editingSetting.category} />
              <input type="hidden" name="settingValueType" value={editingSetting.type} />
              {editingSetting.numberUnit && (
                <input type="hidden" name="numberUnit" value={editingSetting.numberUnit} />
              )}

              {overrideState.status === "error" && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-2 font-medium">
                    <WarningCircleIcon className="size-4" />
                    <span>{overrideState.message}</span>
                  </div>
                  {overrideState.issues && overrideState.issues.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4 text-[11px]">
                      {overrideState.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {overrideState.status === "done" && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircleIcon className="size-4" />
                    <span>{overrideState.message}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="setting-value" className="text-xs font-medium">
                  New Value {editingSetting.numberUnit && `(${editingSetting.numberUnit})`}
                </Label>
                {editingSetting.type === "boolean" ? (
                  <select
                    id="setting-value"
                    name="value"
                    defaultValue={editingSetting.effectiveValue ? "true" : "false"}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs focus-visible:ring-1 focus-visible:outline-none"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                ) : editingSetting.type === "number" ? (
                  <Input
                    id="setting-value"
                    name="value"
                    type="number"
                    defaultValue={String(editingSetting.effectiveValue ?? "")}
                    required
                    className="text-xs"
                  />
                ) : (
                  <Input
                    id="setting-value"
                    name="value"
                    type="text"
                    defaultValue={String(editingSetting.effectiveValue ?? "")}
                    required
                    className="text-xs"
                  />
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="override-reason" className="text-xs font-medium">
                  Reason for Customization (Mandatory)
                </Label>
                <Textarea
                  id="override-reason"
                  name="overrideReason"
                  placeholder="Explain why this setting is being modified for your school..."
                  rows={3}
                  required
                  className="text-xs"
                />
                <span className="text-[11px] text-muted-foreground">
                  Minimum 5 characters. Stored permanently in the compliance audit history.
                </span>
              </div>

              <DialogFooter className="mt-2 flex gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingSetting(null)}
                  disabled={isOverridePending}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isOverridePending}>
                  {isOverridePending ? "Applying..." : "Apply Customization"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Reset to Default Dialog */}
      {resettingSetting && (
        <Dialog open={true} onOpenChange={(open) => !open && setResettingSetting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">Restore Default for {resettingSetting.label}</DialogTitle>
              <DialogDescription className="text-xs">
                This will remove the institution override and revert to the official system default.
              </DialogDescription>
            </DialogHeader>

            <form action={formActionReset} className="flex flex-col gap-4">
              <input type="hidden" name="institutionId" value={institutionId} />
              <input type="hidden" name="settingKey" value={resettingSetting.key} />

              {resetState.status === "error" && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-2 font-medium">
                    <WarningCircleIcon className="size-4" />
                    <span>{resetState.message}</span>
                  </div>
                </div>
              )}

              {resetState.status === "done" && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircleIcon className="size-4" />
                    <span>{resetState.message}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-reason" className="text-xs font-medium">
                  Reason for Restoring Default
                </Label>
                <Textarea
                  id="reset-reason"
                  name="resetReason"
                  placeholder="Explain why this setting is being reverted to default..."
                  rows={3}
                  required
                  className="text-xs"
                />
              </div>

              <DialogFooter className="mt-2 flex gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setResettingSetting(null)}
                  disabled={isResetPending}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" size="sm" disabled={isResetPending}>
                  {isResetPending ? "Restoring..." : "Confirm Revert"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* History Dialog */}
      {historySetting && (
        <Dialog open={true} onOpenChange={(open) => !open && setHistorySetting(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">Change History: {historySetting.label}</DialogTitle>
              <DialogDescription className="text-xs">
                Complete record of previous modifications for this configuration item.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 flex max-h-[380px] flex-col gap-3 overflow-y-auto pr-1">
              {loadingHistory ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Loading change log...
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No previous manual changes recorded for this setting.
                </div>
              ) : (
                historyRecords.map((item) => (
                  <div key={item.id} className="rounded-lg border bg-muted/20 p-3 text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{new Date(item.changedAt).toLocaleString()}</span>
                      <span className="font-mono text-[11px]">Changed by authorized user</span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="line-through text-muted-foreground">
                        {item.previousValue || "(initial)"}
                      </span>
                      <span>→</span>
                      <span className="font-medium text-foreground">{item.newValue}</span>
                    </div>

                    {item.overrideReason && (
                      <p className="mt-2 rounded bg-background p-2 text-[11px] text-muted-foreground">
                        <strong className="text-foreground">Reason:</strong> {item.overrideReason}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHistorySetting(null)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
