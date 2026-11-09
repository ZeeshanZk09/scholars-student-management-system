/**
 * Campuses, buildings and floors (`PHASES.md` Phase 6, task 10). Three levels of physical
 * structure, presented the way they nest: each campus card holds its buildings, each building
 * card its floors — the same reason classes are a tree and not a table. A floor is a *room*
 * container (`DOMAIN-MODEL.md`), so sections later pick a floor, not a building.
 */
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BuildingsIcon } from "@/components/ui/icons";
import { listBuildingsWithFloors, listCampuses, type BuildingRow } from "@/modules/academic";
import {
  CreateBuildingDialog,
  CreateCampusDialog,
  CreateFloorDialog,
} from "@/modules/academic/ui/facility-forms";

import { AcademicPage } from "../_lib/academic-page";

export default async function FacilitiesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return (
    <AcademicPage
      title="Facilities"
      description="Campuses, the buildings on them, and the floors sections are assigned to."
      searchParams={searchParams}
      actions={({ institution }) =>
        institution === null ? null : <CreateCampusDialog institutionId={institution.id} />
      }
      render={async ({ institution }) => {
        const [campuses, buildings] = await Promise.all([
          listCampuses(institution.id),
          listBuildingsWithFloors(institution.id),
        ]);

        if (campuses.length === 0 && buildings.length === 0) {
          return (
            <EmptyState
              icon={BuildingsIcon}
              title="No facilities yet"
              description="A campus is a site, a building sits on it, and floors within it. Sections later point at a floor — so building this structure first makes room assignment possible."
            />
          );
        }

        const byCampus = new Map<string, BuildingRow[]>();
        const unassigned: BuildingRow[] = [];
        for (const building of buildings) {
          if (building.campusId === null) {
            unassigned.push(building);
            continue;
          }
          const bucket = byCampus.get(building.campusId) ?? [];
          bucket.push(building);
          byCampus.set(building.campusId, bucket);
        }

        return (
          <div className="space-y-6">
            {campuses.length === 0 ? (
              <EmptyState
                icon={BuildingsIcon}
                title="No campuses yet"
                description="Add the site first — buildings and floors belong to it."
              />
            ) : (
              campuses.map((campus) => {
                const campusBuildings = byCampus.get(campus.id) ?? [];
                return (
                  <Card key={campus.id}>
                    <CardHeader>
                      <CardTitle>{campus.name}</CardTitle>
                      <CardDescription>
                        {campus.address ?? "No address on file"}
                        {campus.phone !== null && ` · ${campus.phone}`}
                      </CardDescription>
                      <CardAction>
                        <CreateBuildingDialog
                          institutionId={institution.id}
                          campuses={campuses}
                          defaultCampusId={campus.id}
                        />
                      </CardAction>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      {campusBuildings.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No buildings on this campus yet.
                        </p>
                      ) : (
                        campusBuildings.map((building) => (
                          <div key={building.id} className="rounded-none border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{building.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {building.floors.length === 0
                                    ? "No floors yet"
                                    : `${building.floors.length} ${
                                        building.floors.length === 1 ? "floor" : "floors"
                                      }`}
                                </p>
                              </div>
                              <CreateFloorDialog
                                institutionId={institution.id}
                                buildings={[building]}
                                defaultBuildingId={building.id}
                              />
                            </div>

                            {building.floors.length === 0 ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                No floors yet — add one to host sections.
                              </p>
                            ) : (
                              <ul className="mt-2 grid gap-1">
                                {building.floors.map((floor) => (
                                  <li
                                    key={floor.id}
                                    className="flex items-center justify-between gap-2 border-b py-1.5 text-xs"
                                  >
                                    <span className="min-w-0 truncate">{floor.name}</span>
                                    <Badge variant="outline">Level {floor.level}</Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}

            {unassigned.length > 0 && (
              <section aria-labelledby="loose-buildings">
                <h2 id="loose-buildings" className="mb-3 text-sm font-medium text-muted-foreground">
                  Buildings without a campus
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {unassigned.map((building) => (
                    <Card key={building.id}>
                      <CardHeader>
                        <CardTitle className="text-sm">{building.name}</CardTitle>
                        <CardDescription>{building.floors.length} floors</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        );
      }}
    />
  );
}
