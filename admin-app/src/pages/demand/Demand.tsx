import { useQuery } from '@tanstack/react-query';
import { Users, Sparkles } from 'lucide-react';
import { getDemand } from '@/api/notify';
import type { NotifyLead } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Topics that are NOT a single fruit but an umbrella key — badged so the founder reads the per-fruit
// rows correctly ('quiz' = one row per completion, 'honey' = the teaser launch list). Display-only;
// the table still shows every topic the API returns (we never hardcode the fruit allowlist here).
const UMBRELLA_TOPICS = new Set(['quiz', 'honey']);

function leadLocation(l: NotifyLead): string {
  const parts = [l.city, l.state].filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

export function Demand() {
  const demand = useQuery({ queryKey: ['demand'], queryFn: () => getDemand() });

  const data = demand.data;
  const maxFruitSignups = Math.max(1, ...(data?.byFruit ?? []).map((f) => f.signups));
  const maxStateSignups = Math.max(1, ...(data?.byState ?? []).map((s) => s.signups));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demand</h1>
        <p className="text-sm text-muted-foreground">
          Launch-interest captured by the fruit quiz &amp; notify forms. Each person can want many fruits
          (many rows, one phone), so headcount is distinct phones.
        </p>
      </div>

      {demand.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-destructive">
            Failed to load demand.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  People on the waitlist
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">
                  {data ? data.distinctPeople : '—'}
                </div>
                <p className="text-xs text-muted-foreground">distinct phone numbers</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Interest signals
                </CardTitle>
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold">{data ? data.totalRows : '—'}</div>
                <p className="text-xs text-muted-foreground">total rows (fruit picks + umbrella)</p>
              </CardContent>
            </Card>
          </div>

          {/* Most-wanted topics */}
          <Card>
            <CardHeader>
              <CardTitle>Most-wanted</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Topic</TableHead>
                    <TableHead className="w-1/2">Signups</TableHead>
                    <TableHead className="text-right">People</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demand.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : (data?.byFruit.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No signups yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data!.byFruit.map((f) => (
                      <TableRow key={f.topic}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {f.topic}
                            {UMBRELLA_TOPICS.has(f.topic) && (
                              <Badge variant="muted">umbrella</Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 rounded-full bg-primary/70"
                              style={{
                                width: `${Math.max(4, (f.signups / maxFruitSignups) * 100)}%`,
                              }}
                            />
                            <span className="tabular-nums text-muted-foreground">{f.signups}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{f.people}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Demand by state */}
          <Card>
            <CardHeader>
              <CardTitle>By state</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State / UT</TableHead>
                    <TableHead className="w-1/2 text-right">Signups</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demand.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : (data?.byState.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground">
                        No location data yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data!.byState.map((s) => (
                      <TableRow key={s.state}>
                        <TableCell className="font-medium">{s.state}</TableCell>
                        <TableCell>
                          <span className="flex items-center justify-end gap-2">
                            <span
                              className="h-2 rounded-full bg-primary/70"
                              style={{
                                width: `${Math.max(4, (s.signups / maxStateSignups) * 100)}%`,
                              }}
                            />
                            <span className="tabular-nums text-muted-foreground">{s.signups}</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent leads */}
          <Card>
            <CardHeader>
              <CardTitle>Recent leads</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demand.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : (data?.recent.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No leads yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data!.recent.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.name ?? '—'}</TableCell>
                        <TableCell className="tabular-nums">{l.phone}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            {l.topic}
                            {UMBRELLA_TOPICS.has(l.topic) && <Badge variant="muted">umbrella</Badge>}
                          </span>
                        </TableCell>
                        <TableCell>{leadLocation(l)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {new Date(l.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
