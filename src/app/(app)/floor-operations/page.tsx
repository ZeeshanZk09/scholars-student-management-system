/**
 * Live Floor Operations Dashboard (`PRD.md` MODULE 15/17/18/19, `ARCHITECTURE.md` §19).
 *
 * Real-time corridor inspection, period monitoring, substitution tracking,
 * and incident logging for Floor Incharges walking school corridors.
 */
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BuildingsIcon,
  CalendarBlankIcon,
  ClockIcon,
} from "@/components/ui/icons";
import { listBuildingsWithFloors, listTimeSlots } from "@/modules/academic";
import { getFloorWalkthrough } from "@/modules/floor-operations";
import { FloorWalkthroughView } from "@/modules/floor-operations/ui/floor-walkthrough-view";

import { InstitutionPage } from "../_lib/institution-page";

export default async function FloorOperationsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <InstitutionPage
      permission="attendance.view"
      title="Floor Operations"
      description="Real-time classroom monitoring, teacher substitution, period attendance verification, and corridor incident logging."
      breadcrumb={[{ label: "Home", href: "/" }, { label: "Floor Operations" }]}
      searchParams={searchParams}
      accessDenied="You do not have permission to view or manage floor operations."
      empty={{
        chooseInstitution:
          "Choose an institution in the selector above to monitor floor operations.",
        noInstitution: "No institution is available. Create one to begin floor operations.",
        noMembership: "You are not a member of any institution yet.",
      }}
      render={async ({ institution }) => {
        const params = await searchParams;
        const requestedDate = typeof params.date === "string" ? params.date : undefined;
        const todayDate = requestedDate ?? new Date().toISOString().slice(0, 10);

        const [buildings, timeSlots] = await Promise.all([
          listBuildingsWithFloors(institution.id),
          listTimeSlots(institution.id),
        ]);

        // Flatten all floors
        const allFloors = buildings.flatMap((b) =>
          b.floors.map((f) => ({
            ...f,
            buildingName: b.name,
          })),
        );

        if (allFloors.length === 0) {
          return (
            <EmptyState
              icon={BuildingsIcon}
              title="No buildings or floors configured"
              description="Configure campus buildings and floors under Academics > Buildings & Floors to enable floor walk-through monitoring."
            />
          );
        }

        if (timeSlots.length === 0) {
          return (
            <EmptyState
              icon={ClockIcon}
              title="No timetable periods configured"
              description="Configure institutional time slots under Academics > Time Slots to monitor period-by-period class operations."
            />
          );
        }

        // Active selection
        const selectedFloorId =
          typeof params.floor === "string" && allFloors.some((f) => f.id === params.floor)
            ? params.floor
            : allFloors[0]!.id;

        const selectedFloor =
          allFloors.find((f) => f.id === selectedFloorId) ?? allFloors[0]!;

        const teachableSlots = timeSlots.filter((ts) => !ts.isBreak);
        const slotsToDisplay = teachableSlots.length > 0 ? teachableSlots : timeSlots;

        const selectedSlotId =
          typeof params.slot === "string" && slotsToDisplay.some((ts) => ts.id === params.slot)
            ? params.slot
            : slotsToDisplay[0]!.id;

        const selectedSlot =
          slotsToDisplay.find((ts) => ts.id === selectedSlotId) ?? slotsToDisplay[0]!;

        // Fetch walkthrough items for selected floor and time slot
        const items = await getFloorWalkthrough(
          selectedFloor.id,
          todayDate,
          selectedSlot.id,
        );

        return (
          <div className="space-y-6">
            {/* Control Bar: Floor & Period Switchers */}
            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
              {/* Floor Switcher */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Select Floor
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allFloors.map((floor) => {
                    const isSelected = floor.id === selectedFloor.id;
                    const query = new URLSearchParams();
                    query.set("institution", institution.id);
                    query.set("floor", floor.id);
                    query.set("slot", selectedSlot.id);
                    query.set("date", todayDate);

                    return (
                      <Button
                        key={floor.id}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        className="h-8 text-xs"
                        render={<Link href={`/floor-operations?${query.toString()}`} />}
                      >
                        <BuildingsIcon className="mr-1.5 h-3.5 w-3.5" />
                        {floor.buildingName} - {floor.name}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Date Indicator */}
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:self-end">
                <CalendarBlankIcon className="h-4 w-4" />
                <span>Date: <strong>{todayDate}</strong></span>
              </div>
            </div>

            {/* Time Slot Horizontal Tabs */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Select Period / Time Slot
              </div>
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
                {slotsToDisplay.map((slot) => {
                  const isSelected = slot.id === selectedSlot.id;
                  const query = new URLSearchParams();
                  query.set("institution", institution.id);
                  query.set("floor", selectedFloor.id);
                  query.set("slot", slot.id);
                  query.set("date", todayDate);

                  return (
                    <Button
                      key={slot.id}
                      variant={isSelected ? "default" : "secondary"}
                      size="sm"
                      className="h-9 px-3 text-xs"
                      render={<Link href={`/floor-operations?${query.toString()}`} />}
                    >
                      <ClockIcon className="mr-1.5 h-3.5 w-3.5" />
                      <span className="font-semibold">{slot.name}</span>
                      <span className="ml-1 text-[11px] opacity-75">
                        ({slot.startTime.slice(0, 5)} - {slot.endTime.slice(0, 5)})
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Main Corridor Walkthrough View Component */}
            <FloorWalkthroughView
              institutionId={institution.id}
              floorId={selectedFloor.id}
              floorName={`${selectedFloor.buildingName} - ${selectedFloor.name}`}
              attendanceDate={todayDate}
              timeSlotId={selectedSlot.id}
              timeSlotName={`${selectedSlot.name} (${selectedSlot.startTime.slice(0, 5)} - ${selectedSlot.endTime.slice(0, 5)})`}
              items={items}
            />
          </div>
        );
      }}
    />
  );
}
