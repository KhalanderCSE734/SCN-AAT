
import { NextResponse } from "next/server";

// ============================================================
// 1. TYPES AND GLOBAL CONFIGURATION
// ============================================================

type TestCase = {
  id: string;
  duration: number;
  risk: number;
  covers: number[];
};

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

type Candidate = {
  genes: number[];
  fitness: number;
  coverage: number;
  detection: number;
  runtime: number;
  selectedCount: number;
};

const DEFAULT_CONFIG: Config = {
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

const TEST_COUNT = 36;
const CODE_UNIT_COUNT = 15;
const COVERAGE_WEIGHT = 0.55;
const DETECTION_WEIGHT = 0.45;
const RANDOM_TRIALS = 100;

// ============================================================
// 2. SEEDED RANDOM NUMBER GENERATOR
// ============================================================

function makeRng(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ============================================================
// 3. SYNTHETIC DATASET GENERATION
// ============================================================

function generateTests(seed: number) {
  const random = makeRng(seed);
  const tests: TestCase[] = [];

  for (let i = 0; i < TEST_COUNT; i++) {
    const coverageSize = 2 + Math.floor(random() * 5);
    const coverSet = new Set<number>();

    while (coverSet.size < coverageSize) {
      coverSet.add(Math.floor(random() * CODE_UNIT_COUNT));
    }

    tests.push({
      id: `T${String(i + 1).padStart(2, "0")}`,
      duration: 20 + Math.floor(random() * 131),
      risk: Number((0.2 + random() * 0.8).toFixed(3)),
      covers: [...coverSet],
    });
  }

  const unitWeights = Array.from(
    { length: CODE_UNIT_COUNT },
    () => Number((0.4 + random() * 0.6).toFixed(3)),
  );

  return { tests, unitWeights };
}

// ============================================================
// 4. FITNESS FUNCTION AND CONSTRAINT VALIDATION
// ============================================================

function evaluate(
  genes: number[],
  tests: TestCase[],
  unitWeights: number[],
  config: Config,
): Candidate {
  const selected = tests.filter((_, i) => genes[i] === 1);
  const runtime = selected.reduce((sum, test) => sum + test.duration, 0);
  const selectedCount = selected.length;

  const covered = new Set<number>();
  selected.forEach((test) =>
    test.covers.forEach((unit) => covered.add(unit)),
  );

  const totalWeight = unitWeights.reduce((sum, weight) => sum + weight, 0);

  const coveredWeight = [...covered].reduce(
    (sum, unit) => sum + unitWeights[unit],
    0,
  );

  const coverage =
    totalWeight === 0 ? 0 : coveredWeight / totalWeight;

  // Estimated detection proxy:
  // 1 - product of miss probabilities for each code unit.
  let weightedDetection = 0;

  for (let unit = 0; unit < CODE_UNIT_COUNT; unit++) {
    let missProbability = 1;

    for (const test of selected) {
      if (test.covers.includes(unit)) {
        missProbability *= 1 - test.risk;
      }
    }

    weightedDetection +=
      unitWeights[unit] * (1 - missProbability);
  }

  const detection =
    totalWeight === 0 ? 0 : weightedDetection / totalWeight;

  const mandatorySatisfied = config.mandatoryTests.every((id) =>
    selected.some((test) => test.id === id),
  );

  const feasible =
    runtime <= config.budget &&
    selectedCount <= config.maxTests &&
    mandatorySatisfied;

  const fitness = feasible
    ? COVERAGE_WEIGHT * coverage + DETECTION_WEIGHT * detection
    : 0;

  return {
    genes: [...genes],
    fitness,
    coverage,
    detection,
    runtime,
    selectedCount,
  };
}

// ============================================================
// 5. CONSTRAINT REPAIR
// ============================================================

function repair(
  genes: number[],
  tests: TestCase[],
  config: Config,
  random: () => number,
): number[] {
  const fixed = [...genes];

  const mandatoryIndexes = new Set(
    config.mandatoryTests.map((id) =>
      tests.findIndex((test) => test.id === id),
    ),
  );

  // Mandatory tests must always be selected.
  for (const index of mandatoryIndexes) {
    if (index >= 0) fixed[index] = 1;
  }

  const getSelected = () =>
    tests.filter((_, index) => fixed[index] === 1);

  const getRuntime = () =>
    getSelected().reduce((sum, test) => sum + test.duration, 0);

  while (
    getRuntime() > config.budget ||
    getSelected().length > config.maxTests
  ) {
    const removable = tests
      .map((test, index) => ({ test, index }))
      .filter(
        ({ index }) =>
          fixed[index] === 1 && !mandatoryIndexes.has(index),
      )
      .sort((a, b) => {
        const scoreA = a.test.risk / a.test.duration;
        const scoreB = b.test.risk / b.test.duration;

        return scoreA - scoreB || random() - 0.5;
      });

    // Mandatory tests themselves do not fit the constraints.
    // Request validation should normally catch this case.
    if (removable.length === 0) break;

    fixed[removable[0].index] = 0;
  }

  return fixed;
}

function randomGenes(
  tests: TestCase[],
  config: Config,
  random: () => number,
) {
  const genes = tests.map(() => (random() < 0.5 ? 1 : 0));
  return repair(genes, tests, config, random);
}

// ============================================================
// 6. TOURNAMENT SELECTION
// ============================================================

function tournament(
  population: Candidate[],
  random: () => number,
  tournamentSize = 3,
): Candidate {
  let best = population[Math.floor(random() * population.length)];

  for (let i = 1; i < tournamentSize; i++) {
    const contender =
      population[Math.floor(random() * population.length)];

    if (contender.fitness > best.fitness) {
      best = contender;
    }
  }

  return best;
}

// ============================================================
// 7. SINGLE-POINT CROSSOVER
// ============================================================

function crossover(
  parentA: number[],
  parentB: number[],
  random: () => number,
): [number[], number[]] {
  if (parentA.length < 2) {
    return [[...parentA], [...parentB]];
  }

  const point =
    1 + Math.floor(random() * (parentA.length - 1));

  const childA = [
    ...parentA.slice(0, point),
    ...parentB.slice(point),
  ];

  const childB = [
    ...parentB.slice(0, point),
    ...parentA.slice(point),
  ];

  return [childA, childB];
}

// ============================================================
// 8. BIT-FLIP MUTATION
// ============================================================

function mutate(
  genes: number[],
  mutationRate: number,
  random: () => number,
) {
  return genes.map((gene) =>
    random() < mutationRate ? 1 - gene : gene,
  );
}

// ============================================================
// 9. GENETIC ALGORITHM
// ============================================================

function runGA(
  tests: TestCase[],
  unitWeights: number[],
  config: Config,
) {
  const random = makeRng(config.seed);

  const score = (genes: number[]) =>
    evaluate(
      repair(genes, tests, config, random),
      tests,
      unitWeights,
      config,
    );

  let population = Array.from(
    { length: config.populationSize },
    () => score(randomGenes(tests, config, random)),
  );

  population.sort((a, b) => b.fitness - a.fitness);

  let bestEver: Candidate = {
    ...population[0],
    genes: [...population[0].genes],
  };

  const convergence: { generation: number; fitness: number }[] = [
    { generation: 0, fitness: bestEver.fitness },
  ];

  // Number of offspring produced per generation.
  const offspringCount = Math.max(
    1,
    Math.round(config.populationSize * config.offspringRatio),
  );

  for (
    let generation = 1;
    generation <= config.generations;
    generation++
  ) {
    population.sort((a, b) => b.fitness - a.fitness);

    // Elitism: preserve the best candidates unchanged.
    const elites = population
      .slice(0, config.eliteCount)
      .map((candidate) => ({
        ...candidate,
        genes: [...candidate.genes],
      }));

    const offspring: Candidate[] = [];

    while (offspring.length < offspringCount) {
      const parentA = tournament(population, random);
      const parentB = tournament(population, random);

      let [childGenesA, childGenesB] = [
        [...parentA.genes],
        [...parentB.genes],
      ];

      if (random() < config.crossoverRate) {
        [childGenesA, childGenesB] = crossover(
          parentA.genes,
          parentB.genes,
          random,
        );
      }

      childGenesA = mutate(
        childGenesA,
        config.mutationRate,
        random,
      );

      childGenesB = mutate(
        childGenesB,
        config.mutationRate,
        random,
      );

      offspring.push(score(childGenesA));

      if (offspring.length < offspringCount) {
        offspring.push(score(childGenesB));
      }
    }

    // Parent + offspring replacement:
    // select the best candidates from both groups.
    population = [...elites, ...offspring]
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, config.populationSize);

    if (population[0].fitness > bestEver.fitness) {
      bestEver = {
        ...population[0],
        genes: [...population[0].genes],
      };
    }

    // Elitism ensures best-so-far fitness never decreases.
    convergence.push({
      generation,
      fitness: bestEver.fitness,
    });
  }

  return { best: bestEver, convergence, offspringCount };
}

// ============================================================
// 10. GREEDY BASELINE
// ============================================================

function runGreedy(
  tests: TestCase[],
  unitWeights: number[],
  config: Config,
): Candidate {
  const random = makeRng(config.seed + 101);

  let genes: number[] = tests.map((test) =>
    config.mandatoryTests.includes(test.id) ? 1 : 0,
  );

  genes = repair(genes, tests, config, random);

  let current = evaluate(genes, tests, unitWeights, config);

  const order = tests
    .map((test, index) => ({ test, index }))
    .filter(({ index }) => genes[index] === 0)
    .sort((a, b) => {
      const ratioA = a.test.risk / a.test.duration;
      const ratioB = b.test.risk / b.test.duration;
      return ratioB - ratioA;
    });

  for (const { index } of order) {
    const trial = [...genes];
    trial[index] = 1;

    const repaired = repair(trial, tests, config, random);
    const candidate = evaluate(
      repaired,
      tests,
      unitWeights,
      config,
    );

    if (candidate.fitness > current.fitness) {
      genes = repaired;
      current = candidate;
    }
  }

  return current;
}

// ============================================================
// 11. RANDOM BASELINE
// ============================================================

function runRandomBaseline(
  tests: TestCase[],
  unitWeights: number[],
  config: Config,
) {
  const results: Candidate[] = [];

  for (let trial = 0; trial < RANDOM_TRIALS; trial++) {
    const random = makeRng(config.seed + 1000 + trial);

    const order = tests.map((_, index) => index);

    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let genes: number[] = tests.map((test) =>
      config.mandatoryTests.includes(test.id) ? 1 : 0,
    );

    // Add randomly ordered tests while preserving feasibility.
    for (const index of order) {
      if (genes[index] === 1) continue;

      const trialGenes = [...genes];
      trialGenes[index] = 1;

      const repaired = repair(
        trialGenes,
        tests,
        config,
        random,
      );

      const trialResult = evaluate(
        repaired,
        tests,
        unitWeights,
        config,
      );

      if (
        trialResult.runtime <= config.budget &&
        trialResult.selectedCount <= config.maxTests
      ) {
        genes = repaired;
      }
    }

    results.push(
      evaluate(genes, tests, unitWeights, config),
    );
  }

  const average = (
    key:
      | "fitness"
      | "coverage"
      | "detection"
      | "runtime"
      | "selectedCount",
  ) =>
    results.reduce((sum, result) => sum + result[key], 0) /
    results.length;

  const best = [...results].sort(
    (a, b) => b.fitness - a.fitness,
  )[0];

  return {
    average: {
      fitness: average("fitness"),
      coverage: average("coverage"),
      detection: average("detection"),
      runtime: average("runtime"),
      selectedCount: average("selectedCount"),
    },
    best,
    trials: RANDOM_TRIALS,
  };
}

// ============================================================
// 12. REQUEST VALIDATION
// ============================================================

function parseConfig(body: Partial<Config>): Config {
  const config: Config = {
    ...DEFAULT_CONFIG,
    ...body,
    mandatoryTests: Array.isArray(body.mandatoryTests)
      ? body.mandatoryTests
      : DEFAULT_CONFIG.mandatoryTests,
  };

  if (
    !Number.isInteger(config.populationSize) ||
    config.populationSize < 10 ||
    config.populationSize > 300
  ) {
    throw new Error(
      "Population size must be between 10 and 300.",
    );
  }

  if (
    !Number.isInteger(config.generations) ||
    config.generations < 10 ||
    config.generations > 500
  ) {
    throw new Error("Generations must be between 10 and 500.");
  }

  if (
    !Number.isFinite(config.crossoverRate) ||
    config.crossoverRate < 0 ||
    config.crossoverRate > 1
  ) {
    throw new Error("Crossover rate must be between 0 and 1.");
  }

  if (
    !Number.isFinite(config.mutationRate) ||
    config.mutationRate < 0 ||
    config.mutationRate > 1
  ) {
    throw new Error("Mutation rate must be between 0 and 1.");
  }

  if (
    !Number.isFinite(config.offspringRatio) ||
    config.offspringRatio < 0.25 ||
    config.offspringRatio > 2
  ) {
    throw new Error("Offspring ratio must be between 0.25 and 2.");
  }

  if (
    !Number.isInteger(config.eliteCount) ||
    config.eliteCount < 1 ||
    config.eliteCount >= config.populationSize
  ) {
    throw new Error(
      "Elite count must be at least 1 and smaller than population size.",
    );
  }

  if (
    !Number.isFinite(config.budget) ||
    config.budget <= 0
  ) {
    throw new Error("Budget must be a positive number.");
  }

  if (
    !Number.isInteger(config.maxTests) ||
    config.maxTests < 1 ||
    config.maxTests > TEST_COUNT
  ) {
    throw new Error("Maximum tests must be between 1 and 36.");
  }

  if (
    !Number.isInteger(config.seed) ||
    !Number.isSafeInteger(config.seed)
  ) {
    throw new Error("Seed must be a valid integer.");
  }

  const validIds = new Set(
    testsIds(),
  );

  if (
    config.mandatoryTests.some(
      (id) => typeof id !== "string" || !validIds.has(id),
    )
  ) {
    throw new Error("One or more mandatory test IDs are invalid.");
  }

  if (
    new Set(config.mandatoryTests).size !==
    config.mandatoryTests.length
  ) {
    throw new Error("Mandatory test IDs must not contain duplicates.");
  }

  return config;
}

function testsIds() {
  return Array.from(
    { length: TEST_COUNT },
    (_, i) => `T${String(i + 1).padStart(2, "0")}`,
  );
}

// ============================================================
// 13. NEXT.JS API HANDLER
// ============================================================

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Config>;
    const config = parseConfig(body);

    const { tests, unitWeights } = generateTests(config.seed);

    const mandatory = tests.filter((test) =>
      config.mandatoryTests.includes(test.id),
    );

    const mandatoryRuntime = mandatory.reduce(
      (sum, test) => sum + test.duration,
      0,
    );

    if (mandatoryRuntime > config.budget) {
      return NextResponse.json(
        {
          error: `Mandatory tests require ${mandatoryRuntime}s, exceeding the ${config.budget}s budget.`,
        },
        { status: 400 },
      );
    }

    if (mandatory.length > config.maxTests) {
      return NextResponse.json(
        {
          error:
            "Mandatory test count exceeds the maximum test-count constraint.",
        },
        { status: 400 },
      );
    }

    const { best, convergence, offspringCount } = runGA(
      tests,
      unitWeights,
      config,
    );

    const greedy = runGreedy(
      tests,
      unitWeights,
      config,
    );

    const random = runRandomBaseline(
      tests,
      unitWeights,
      config,
    );

    const methods = [
      {
        method: "Genetic Algorithm",
        fitness: best.fitness,
        coverage: best.coverage,
        detection: best.detection,
        runtime: best.runtime,
        selectedCount: best.selectedCount,
      },
      {
        method: "Greedy",
        fitness: greedy.fitness,
        coverage: greedy.coverage,
        detection: greedy.detection,
        runtime: greedy.runtime,
        selectedCount: greedy.selectedCount,
      },
      {
        method: "Random (average)",
        ...random.average,
      },
      {
        method: "Random (best)",
        fitness: random.best.fitness,
        coverage: random.best.coverage,
        detection: random.best.detection,
        runtime: random.best.runtime,
        selectedCount: random.best.selectedCount,
      },
    ];

    const selectedTests = tests
      .filter((_, index) => best.genes[index] === 1)
      .map((test) => ({ ...test }));

    const coveredIndexes = [
      ...new Set(
        selectedTests.flatMap((test) => test.covers),
      ),
    ];

    const uncoveredUnits = Array.from(
      { length: CODE_UNIT_COUNT },
      (_, i) => i,
    )
      .filter((unit) => !coveredIndexes.includes(unit))
      .map((unit) => `C${unit + 1}`);

    return NextResponse.json({
      config,

      dataset: {
        testCount: tests.length,
        codeUnitCount: CODE_UNIT_COUNT,
        synthetic: true,
        seed: config.seed,
      },

      algorithm: {
        parentCount: config.populationSize,
        offspringCount,
        parentToOffspringRatio:
          `${config.populationSize}:${offspringCount}`,
        eliteCount: config.eliteCount,
        randomTrials: random.trials,
      },

      best: {
        fitness: best.fitness,
        coverage: best.coverage,
        detection: best.detection,
        runtime: best.runtime,
        selectedCount: best.selectedCount,
        selectedTests,
        coveredUnits: coveredIndexes.map(
          (unit) => `C${unit + 1}`,
        ),
        uncoveredUnits,
        budgetRemaining: config.budget - best.runtime,
      },

      methods,
      convergence,

      constraints: {
        budget: config.budget,
        runtimeSatisfied: best.runtime <= config.budget,
        maxTests: config.maxTests,
        testCountSatisfied:
          best.selectedCount <= config.maxTests,
        mandatoryTests: config.mandatoryTests,
        mandatoryTestsSatisfied:
          config.mandatoryTests.every((id) =>
            selectedTests.some((test) => test.id === id),
          ),
      },

      assumptions: {
        coverageWeight: COVERAGE_WEIGHT,
        detectionWeight: DETECTION_WEIGHT,
        detectionIsEstimate: true,
        note:
          "Synthetic dataset. Estimated detection value is a model-based proxy, not a measured real-world defect detection rate.",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected optimization error.",
      },
      { status: 400 },
    );
  }
}
