"use client";

/**
 * Monthly Student Report Card Component (`PRD.md` MODULE 22).
 *
 * Provides a clean, print-ready, parent- and student-friendly report card view
 * synthesizing daily test performance across all subjects for a given month.
 */
import * as React from "react";
import {
  BookBookmarkIcon,
  CalendarBlankIcon,
  ChartLineUpIcon,
  CheckCircleIcon,
  FileTextIcon,
  PrinterIcon,
  UserIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudentMonthlyReportCard, SubjectReportCardItem } from "../application/ports";

interface MonthlyReportCardProps {
  readonly reportCard: StudentMonthlyReportCard;
  readonly isStaffView?: boolean;
}

function formatPeriodMonth(yearMonth: string): string {
  try {
    const [yearStr, monthStr] = yearMonth.split("-");
    const year = parseInt(yearStr ?? "2026", 10);
    const month = parseInt(monthStr ?? "1", 10) - 1;
    const date = new Date(Date.UTC(year, month, 1));
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  } catch {
    return yearMonth;
  }
}

function getRatingBadgeVariant(rating?: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!rating) return "secondary";
  if (rating.includes("Outstanding") || rating.includes("Excellent")) return "default";
  if (rating.includes("Good") || rating.includes("Satisfactory")) return "secondary";
  if (rating.includes("Support") || rating.includes("Needs Focus")) return "destructive";
  return "outline";
}

export function MonthlyReportCard({ reportCard, isStaffView = false }: MonthlyReportCardProps) {
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string | null>(null);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const periodLabel = formatPeriodMonth(reportCard.periodMonth);
  const selectedSubject = reportCard.subjects.find((s) => s.subjectId === selectedSubjectId);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 print:p-0 print:space-y-4">
      {/* Top action bar (hidden during print) */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Monthly Academic Progress Card
          </h2>
          <p className="text-sm text-muted-foreground">
            Official monthly test performance summary for {periodLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
            <PrinterIcon className="size-4" />
            Print Report Card
          </Button>
        </div>
      </div>

      {/* Main Printable Card Container */}
      <div className="space-y-6 rounded-lg border bg-card p-6 shadow-sm print:border-none print:p-0 print:shadow-none">
        {/* School Header */}
        <div className="border-b pb-6 text-center print:pb-4">
          <div className="flex items-center justify-center gap-2 text-primary">
            <BookBookmarkIcon className="size-8" weight="duotone" />
            <h1 className="text-2xl font-black tracking-wide uppercase">
              {reportCard.institutionName}
            </h1>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {reportCard.sessionName} • Student Monthly Progress Report
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <CalendarBlankIcon className="size-3.5" />
            <span>Reporting Period: {periodLabel}</span>
          </div>
        </div>

        {/* Student Profile Card */}
        <div className="grid grid-cols-2 gap-4 rounded-md bg-muted/30 p-4 text-xs md:grid-cols-4 print:bg-transparent print:p-2">
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Student Name</span>
            <div className="flex items-center gap-1.5 font-semibold text-foreground text-sm">
              <UserIcon className="size-4 text-muted-foreground" />
              <span>{reportCard.studentName}</span>
            </div>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Admission Number</span>
            <p className="font-semibold text-foreground text-sm">{reportCard.admissionNumber}</p>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Class & Section</span>
            <p className="font-semibold text-foreground text-sm">
              {reportCard.className}
              {reportCard.sectionName ? ` - ${reportCard.sectionName}` : ""}
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-muted-foreground">Class Roll Number</span>
            <p className="font-semibold text-foreground text-sm">
              {reportCard.rollNumber ? `#${reportCard.rollNumber}` : "Not Assigned"}
            </p>
          </div>
        </div>

        {/* Key Performance Indicators */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 print:grid-cols-3">
          <Card size="sm">
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1">
                <ChartLineUpIcon className="size-4" />
                Monthly Aggregate Score
              </CardDescription>
              <CardTitle className="text-2xl font-bold">
                {reportCard.overallPercentage !== null
                  ? `${reportCard.overallPercentage}%`
                  : "Pending"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Average percentage across all evaluated subjects
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1">
                <CheckCircleIcon className="size-4" />
                Performance Level
              </CardDescription>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-bold">
                  {reportCard.gradeBand ? reportCard.gradeBand : "N/A"}
                </CardTitle>
                <Badge variant={getRatingBadgeVariant(reportCard.performanceRating)}>
                  {reportCard.performanceRating ?? "Evaluating"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {reportCard.remarks ?? "Based on ongoing monthly curriculum evaluations."}
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader className="pb-1">
              <CardDescription className="flex items-center gap-1">
                <FileTextIcon className="size-4" />
                Total Tests Sat
              </CardDescription>
              <CardTitle className="text-2xl font-bold">
                {reportCard.totalTestsSat}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Total daily tests and quizzes attended this month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Subject-Wise Performance Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">
              Subject-Wise Test Evaluation Breakdown
            </h3>
            {isStaffView && (
              <span className="text-xs text-muted-foreground">
                Showing {reportCard.subjects.length} subjects (Staff View includes drafts)
              </span>
            )}
          </div>

          {reportCard.subjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <WarningCircleIcon className="size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">No Evaluated Tests Available</p>
              <p className="text-xs text-muted-foreground">
                There are no finalized monthly reports for this student in the selected period.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Code</TableHead>
                    <TableHead>Subject Name</TableHead>
                    <TableHead className="text-center">Tests Sat</TableHead>
                    <TableHead className="text-right">Monthly Score</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right print:hidden">Breakdown</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportCard.subjects.map((sub: SubjectReportCardItem) => (
                    <TableRow key={sub.subjectId}>
                      <TableCell className="font-mono text-xs font-semibold text-muted-foreground">
                        {sub.subjectCode}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {sub.subjectName}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                          {sub.testsCounted} {sub.testsCounted === 1 ? "test" : "tests"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-bold text-sm">
                        {sub.averagePercentage !== null ? (
                          <span
                            className={
                              sub.averagePercentage >= 70
                                ? "text-emerald-600 dark:text-emerald-400"
                                : sub.averagePercentage >= 50
                                  ? "text-foreground"
                                  : "text-rose-600 dark:text-rose-400"
                            }
                          >
                            {sub.averagePercentage}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No Sat Tests</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            sub.status === "locked"
                              ? "default"
                              : sub.status === "published"
                                ? "secondary"
                                : "outline"
                          }
                          className="capitalize text-[10px]"
                        >
                          {sub.status === "locked" ? "Finalized" : sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right print:hidden">
                        {sub.breakdown && Object.keys(sub.breakdown).length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() =>
                              setSelectedSubjectId(
                                selectedSubjectId === sub.subjectId ? null : sub.subjectId,
                              )
                            }
                          >
                            {selectedSubjectId === sub.subjectId ? "Hide" : "View Tests"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Detailed Per-Test Drilldown Section (If Selected) */}
        {selectedSubject && selectedSubject.breakdown && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4 print:hidden">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-xs tracking-wide uppercase text-foreground">
                Contributing Daily Tests for {selectedSubject.subjectName}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setSelectedSubjectId(null)}
              >
                Close
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(selectedSubject.breakdown).map(([testId, testEntry]) => (
                <div
                  key={testId}
                  className="flex items-center justify-between rounded border bg-card p-2.5 text-xs shadow-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">{testEntry.title}</span>
                    <p className="text-[11px] text-muted-foreground">Date: {testEntry.testDate}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-foreground">
                      {testEntry.status === "present"
                        ? `${testEntry.obtained} / ${testEntry.total}`
                        : testEntry.status.toUpperCase()}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {testEntry.status === "present" ? `${testEntry.percentage}%` : "0% counted"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Remarks & Signature Lines (Especially for Print) */}
        <div className="mt-8 border-t pt-6 text-xs text-muted-foreground print:mt-12 print:pt-4">
          <div className="grid grid-cols-2 gap-8 text-center">
            <div className="space-y-12">
              <div className="mx-auto w-48 border-b border-foreground/30" />
              <p className="font-medium text-foreground">Class Teacher&apos;s Signature</p>
            </div>
            <div className="space-y-12">
              <div className="mx-auto w-48 border-b border-foreground/30" />
              <p className="font-medium text-foreground">Principal / Head of Institution</p>
            </div>
          </div>
          <p className="mt-8 text-center text-[11px] text-muted-foreground print:mt-6">
            Generated on {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(reportCard.generatedAt)}.
            Scholars Student Management System — Academic Progress Records.
          </p>
        </div>
      </div>
    </div>
  );
}
