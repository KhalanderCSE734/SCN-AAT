
"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";

type Config = {
  populationSize: number;
  generations: number;
  crossoverRate: number;
  mutationRate: number;
  eliteCount: number;
  offspringRatio: number;
  budget: number;
  maxTests: number;
  mandatoryTests: string[];
  seed: number;
};

type Test = {
  id: string;
  duration: number;
  risk: number;
  covers: number[];
};

type Result = {
  config: Config;
  dataset: {
    testCount: number;
    codeUnitCount: number;
    synthetic: boolean;
    seed: number;
  };
  algorithm: {
    parentCount: number;
    offspringCount: number;
    parentToOffspringRatio: string;
    eliteCount: number;
    randomTrials: number;
  };
  best: {
    fitness: number;
    coverage: number;
    detection: number;
    runtime: number;
    selectedCount: number;
    selectedTests: Test[];
    coveredUnits: string[];
    uncoveredUnits: string[];
    budgetRemaining: number;
  };
  methods: {
    method: string;
    fitness: number;
    coverage: number;
    detection: number;
    runtime: number;
    selectedCount: number;
  }[];
  convergence: { generation: number; fitness: number }[];
  constraints: {
    budget: number;
    runtimeSatisfied: boolean;
    maxTests: number;
    testCountSatisfied: boolean;
    mandatoryTests: string[];
    mandatoryTestsSatisfied: boolean;
  };
  assumptions: {
    coverageWeight: number;
    detectionWeight: number;
    detectionIsEstimate: boolean;
    note: string;
  };
};

const INITIAL: Config = {
  populationSize: 80,
  generations: 120,
  crossoverRate: 0.85,
  mutationRate: 0.025,
  eliteCount: 2,
  offspringRatio: 1,
  budget: 600,
  maxTests: 20,
  mandatoryTests: [],
  seed: 42,
};

const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const score = (n: number) => n.toFixed(3);

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export default function Home() {
  const [config, setConfig] = useState<Config>(INITIAL);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((previous) => ({ ...previous, [key]: value }));
  }

  async function optimize() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/genetic-algo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Optimization failed.");
      }

      setResult(data as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="border-b pb-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
            Soft Computing · AAT · Unit 3
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Risk-Aware Regression Test Selection
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Genetic Algorithm optimization under a fixed CI/CD runtime budget.
            Compare GA, Greedy and Random selection using coverage, estimated
            detection value and execution time.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            Synthetic test data · Reproducible seed · GA implemented in the API
          </p>
        </header>

        <Section title="Genetic Algorithm Configuration">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              Population size
              <input
                className={fieldClass}
                type="number"
                min={10}
                max={300}
                value={config.populationSize}
                onChange={(e) =>
                  update("populationSize", Number(e.target.value))
                }
              />
            </label>

            <label className="text-sm">
              Generations
              <input
                className={fieldClass}
                type="number"
                min={10}
                max={500}
                value={config.generations}
                onChange={(e) => update("generations", Number(e.target.value))}
              />
            </label>

            <label className="text-sm">
              Crossover rate
              <input
                className={fieldClass}
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={config.crossoverRate}
                onChange={(e) =>
                  update("crossoverRate", Number(e.target.value))
                }
              />
            </label>

            <label className="text-sm">
              Mutation rate per bit
              <input
                className={fieldClass}
                type="number"
                min={0}
                max={1}
                step={0.005}
                value={config.mutationRate}
                onChange={(e) =>
                  update("mutationRate", Number(e.target.value))
                }
              />
            </label>

            <label className="text-sm">
              Offspring-to-parent-population ratio
              <select
                className={fieldClass}
                value={config.offspringRatio}
                onChange={(e) =>
                  update("offspringRatio", Number(e.target.value))
                }
              >
                <option value={0.5}>0.5 — half population</option>
                <option value={0.75}>0.75 — three quarters</option>
                <option value={1}>1.0 — equal to population</option>
                <option value={1.5}>1.5 — one and a half</option>
                <option value={2}>2.0 — double population</option>
              </select>
            </label>

            <label className="text-sm">
              Elite count
              <input
                className={fieldClass}
                type="number"
                min={1}
                max={Math.max(1, config.populationSize - 1)}
                value={config.eliteCount}
                onChange={(e) => update("eliteCount", Number(e.target.value))}
              />
            </label>

            <label className="text-sm">
              Runtime budget (seconds)
              <input
                className={fieldClass}
                type="number"
                min={1}
                value={config.budget}
                onChange={(e) => update("budget", Number(e.target.value))}
              />
            </label>

            <label className="text-sm">
              Maximum tests selected
              <input
                className={fieldClass}
                type="number"
                min={1}
                max={36}
                value={config.maxTests}
                onChange={(e) => update("maxTests", Number(e.target.value))}
              />
            </label>

            <label className="text-sm">
              Random seed
              <input
                className={fieldClass}
                type="number"
                value={config.seed}
                onChange={(e) => update("seed", Number(e.target.value))}
              />
            </label>
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium">
              Mandatory tests (optional)
            </label>
            <p className="mb-2 mt-1 text-xs text-slate-500">
              Select tests that must be included. Their combined runtime must
              fit the budget.
            </p>
            <div className="flex flex-wrap gap-2">
              {
                Array.from({ length: 36 }, (_, i) =>
                  `T${String(i + 1).padStart(2, "0")}`,
                ).map((id) => (
                  <label
                    key={id}
                    className={`cursor-pointer rounded-md border px-2 py-1 text-xs ${config.mandatoryTests.includes(id)
                      ? "border-blue-700 bg-blue-50 text-blue-800"
                      : "bg-white text-slate-600"
                      }`}
                  >
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={config.mandatoryTests.includes(id)}
                      onChange={(e) =>
                        update(
                          "mandatoryTests",
                          e.target.checked
                            ? [...config.mandatoryTests, id]
                            : config.mandatoryTests.filter((x) => x !== id),
                        )
                      }
                    />
                    {id}
                  </label>
                ))
            }
            </div>
          </div>

          <div className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <strong>Parent population:</strong> {config.populationSize}
            {" · "}
            <strong>Expected offspring per generation:</strong>{" "}
            {Math.max(1, Math.round(config.populationSize * config.offspringRatio))}
            {" · "}
            <strong>Fitness:</strong> 0.55 × weighted coverage + 0.45 ×
            estimated detection value
          </div>

          <button
            onClick={optimize}
            disabled={loading}
            className="mt-5 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Running optimization..." : "Run Genetic Algorithm"}
          </button>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </Section>

        {result && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Best fitness"
                value={score(result.best.fitness)}
                hint="Higher is better"
              />
              <Metric
                label="Risk-weighted coverage"
                value={percent(result.best.coverage)}
                hint={`${result.best.coveredUnits.length} of ${result.dataset.codeUnitCount} code units covered`}
              />
              <Metric
                label="Estimated detection value"
                value={percent(result.best.detection)}
                hint="Model-based estimate, not measured bug detection"
              />
              <Metric
                label="Runtime used"
                value={`${result.best.runtime} s`}
                hint={`${result.best.budgetRemaining} s remaining`}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Fitness Convergence">
                <p className="mb-3 text-sm text-slate-500">
                  Best-so-far fitness across generations.
                </p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.convergence}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="generation"
                        label={{
                          value: "Generation",
                          position: "insideBottom",
                          offset: -3,
                        }}
                      />
                      <YAxis domain={[0, 1]} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="fitness"
                        name="Best fitness"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Algorithm Comparison">
                <p className="mb-3 text-sm text-slate-500">
                  Compare fitness, coverage and estimated detection value.
                </p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.methods}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="method" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 1]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="fitness" fill="#2563eb" />
                      <Bar dataKey="coverage" fill="#16a34a" />
                      <Bar dataKey="detection" fill="#d97706" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Section>

              <Section title="Runtime Budget Utilization">
                <p className="mb-3 text-sm text-slate-500">
                  Selected runtime compared with the configured budget.
                </p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: "Selected runtime",
                          seconds: result.best.runtime,
                        },
                        {
                          name: "Remaining budget",
                          seconds: result.best.budgetRemaining,
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="seconds" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-sm">
                  Utilization:{" "}
                  <strong>
                    {percent(result.best.runtime / result.config.budget)}
                  </strong>
                </p>
              </Section>

              <Section title="Constraint Validation">
                <div className="space-y-3 text-sm">
                  {[
                    [
                      "Runtime budget",
                      result.constraints.runtimeSatisfied,
                      `${result.best.runtime}s / ${result.config.budget}s`,
                    ],
                    [
                      "Maximum selected tests",
                      result.constraints.testCountSatisfied,
                      `${result.best.selectedCount} / ${result.config.maxTests}`,
                    ],
                    [
                      "Mandatory tests",
                      result.constraints.mandatoryTestsSatisfied,
                      result.config.mandatoryTests.length
                        ? result.config.mandatoryTests.join(", ")
                        : "No mandatory tests configured",
                    ],
                  ].map(([label, passed, detail]) => (
                    <div
                      key={String(label)}
                      className="flex items-start justify-between gap-4 border-b pb-3"
                    >
                      <div>
                        <p className="font-medium">{String(label)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {String(detail)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${passed
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                          }`}
                      >
                        {passed ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>

            <Section title="Selected Regression Tests">
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Selected tests"
                  value={`${result.best.selectedCount} / ${result.dataset.testCount}`}
                />
                <Metric
                  label="Covered code units"
                  value={`${result.best.coveredUnits.length} / ${result.dataset.codeUnitCount}`}
                />
                <Metric
                  label="Parent : offspring"
                  value={result.algorithm.parentToOffspringRatio}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="p-3">Test ID</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3">Risk</th>
                      <th className="p-3">Covered units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.best.selectedTests.map((test) => (
                      <tr key={test.id} className="border-b">
                        <td className="p-3 font-semibold">{test.id}</td>
                        <td className="p-3">{test.duration}s</td>
                        <td className="p-3">{test.risk.toFixed(3)}</td>
                        <td className="p-3">
                          {test.covers.map((unit) => `C${unit + 1}`).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold">Covered code units</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {result.best.coveredUnits.join(", ") || "None"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Uncovered code units</p>
                  <p className="mt-2 text-sm text-slate-600">
                    {result.best.uncoveredUnits.join(", ") || "None"}
                  </p>
                </div>
              </div>
            </Section>

            <Section title="Experiment Details">
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <p>Dataset: {result.dataset.testCount} synthetic tests</p>
                <p>Changed-code units: {result.dataset.codeUnitCount}</p>
                <p>Random baseline trials: {result.algorithm.randomTrials}</p>
                <p>Elite candidates: {result.algorithm.eliteCount}</p>
                <p>Coverage weight: {result.assumptions.coverageWeight}</p>
                <p>Detection weight: {result.assumptions.detectionWeight}</p>
              </div>
              {/* <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                Limitation: {result.assumptions.note}
              </p> */}
            </Section>
          </>
        )}
      </div>
    </main>
  );
}
