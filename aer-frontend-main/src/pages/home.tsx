import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  FaBolt,
  FaFlagCheckered,
  FaHeartbeat,
  FaRunning,
  FaSnowflake,
} from "react-icons/fa";
import GraficoPace from "@/components/grafico-corrida";
import { useEffect, useState } from "react";
import { TrainingPlan } from "trainingPlanCalculatorAPI";
import getTrainingProgram from "@/services/get-trainingplan/get-training-plan";
import { ImSpinner11 } from "react-icons/im";
import { processData } from "@/utils/getGraphData";
import splitStringFormatted from "@/utils/split-string-split";
import { Link } from "react-router-dom";

function parseRequiredNumberParam(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
}

function parseOptionalNumberParam(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  return parsedValue;
}

type SplitSection = {
  key: string;
  label: string;
  value: string;
};

type SplitMetric = {
  label: string;
  value: string;
};

type TrainingItem = {
  training_title_pt: string;
  training_description_pt: string;
  total_training_distance: number;
  split_string: string;
  threshold_pace?: string | number;
  treshold_pace?: string | number;
  interval_pace?: string | number;
  repetition_pace?: string | number;
};

type GraphPoint = {
  km: number;
  pace_s: number;
  pace: string;
  km_h: number;
};

const splitSectionLabelMap: Record<string, string> = {
  warmup: "Aquecimento",
  sets: "Series",
  rest: "Recuperacao",
  cooldown: "Arrefecimento",
};

function buildSplitSections(splitText: string): SplitSection[] {
  return splitText
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const labeledChunkMatch = chunk.match(/^([A-Za-zÀ-ÿ ]{3,}):\s*(.+)$/);

      if (!labeledChunkMatch) {
        return {
          key: `section-${index}`,
          label: "Bloco principal",
          value: chunk,
        };
      }

      const rawLabel = labeledChunkMatch[1].trim();
      const rawValue = labeledChunkMatch[2].trim();
      const normalizedLabelKey = rawLabel.toLowerCase();

      return {
        key: `section-${index}`,
        label: splitSectionLabelMap[normalizedLabelKey] ?? rawLabel,
        value: rawValue,
      };
    });
}

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${minutes}min`;
}

function formatPaceFromSeconds(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) {
    return "--:--";
  }

  const wholeSeconds = Math.round(secondsPerKm);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0"
  )}`;
}

function getSplitToneStyle(label: string): string {
  const normalized = label.toLowerCase();

  if (normalized.includes("series")) {
    return "border-[#2b6cb066] bg-[#1a2430] text-[#8fc3ff]";
  }

  if (normalized.includes("recuperacao")) {
    return "border-[#2f855a66] bg-[#18261f] text-[#8fe3b8]";
  }

  if (normalized.includes("aquecimento") || normalized.includes("arrefecimento")) {
    return "border-[#975a1666] bg-[#2b2015] text-[#f0c98f]";
  }

  return "border-[#d4a54f33] bg-[#1f1f1f] text-[#c9ced9]";
}

function getSplitSectionIcon(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("series")) {
    return <FaBolt size={11} className="text-[#8fc3ff]" />;
  }

  if (normalized.includes("recuperacao")) {
    return <FaSnowflake size={11} className="text-[#8fe3b8]" />;
  }

  if (normalized.includes("aquecimento")) {
    return <FaHeartbeat size={11} className="text-[#f0c98f]" />;
  }

  if (normalized.includes("arrefecimento")) {
    return <FaFlagCheckered size={11} className="text-[#f0c98f]" />;
  }

  return <FaRunning size={11} className="text-[#c9ced9]" />;
}

type SplitDetailsPanelProps = {
  splitRaw: unknown;
  totalDistanceKm: number;
  compact?: boolean;
  graphData?: GraphPoint[];
};

function SplitDetailsPanel({
  splitRaw,
  totalDistanceKm,
  compact = false,
  graphData = [],
}: SplitDetailsPanelProps) {
  const formattedSplit = splitStringFormatted(splitRaw);
  const sections = buildSplitSections(formattedSplit);

  const durationFromGraph = graphData.reduce((sum, point, index) => {
    if (index === 0) return sum;
    const segmentDistance = point.km - graphData[index - 1].km;
    if (segmentDistance <= 0 || !Number.isFinite(point.pace_s)) return sum;
    return sum + segmentDistance * point.pace_s;
  }, 0);

  const derivedDistance =
    graphData.length > 0
      ? graphData[graphData.length - 1].km
      : totalDistanceKm;
  const totalDurationSeconds = durationFromGraph;
  const averagePaceSeconds =
    derivedDistance > 0 ? totalDurationSeconds / derivedDistance : 0;

  const splitMetrics: SplitMetric[] = [
    {
      label: "Duracao estimada",
      value: totalDurationSeconds > 0 ? formatSeconds(totalDurationSeconds) : "--",
    },
    {
      label: "Distancia total",
      value: `${totalDistanceKm.toFixed(1)}km`,
    },
    {
      label: "Ritmo medio",
      value:
        averagePaceSeconds > 0
          ? `${formatPaceFromSeconds(averagePaceSeconds)}/km`
          : "--",
    },
  ];

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
        {splitMetrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-md border border-[#d4a54f22] bg-[#171717] px-2 py-1"
          >
            <p className="text-[10px] uppercase tracking-[0.08em] text-[#d4a54f] font-semibold">
              {metric.label}
            </p>
            <p className="text-xs text-[#f4f6fa] leading-tight">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sections.map((section) => (
          <div
            key={section.key}
            className={`rounded-lg border transition-all duration-200 ${
              compact ? "px-2.5 py-2" : "px-3 py-2"
            } ${getSplitToneStyle(section.label)}`}
          >
            <div className="flex items-center gap-1.5">
              {getSplitSectionIcon(section.label)}
              <p className="text-[11px] uppercase tracking-[0.08em] font-semibold">
                {section.label}
              </p>
            </div>
            <p
              className={`${compact ? "text-xs" : "text-sm"} leading-relaxed text-[#e1e5ee]`}
            >
              {section.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

type TrainingSessionCardProps = {
  training: TrainingItem;
  compactSplit?: boolean;
};

function TrainingSessionCard({
  training,
  compactSplit = false,
}: TrainingSessionCardProps) {
  const graphData = processData(training.split_string);

  return (
    <div className="bg-[#262626] p-2.5 rounded-md mb-2 border border-[#d4a54f26]">
      <div className="w-full flex flex-row items-center justify-between ">
        <h2 className="font-bold text-[16px]">{training.training_title_pt}</h2>
      </div>

      <p className="text-[#c9ced9] italic leading-snug mt-0.5">{training.training_description_pt}</p>

      <SplitDetailsPanel
        splitRaw={training.split_string}
        totalDistanceKm={training.total_training_distance}
        compact={compactSplit}
        graphData={graphData}
      />

      <div className="w-full h-[128px] md:h-[178px] mt-3">
        <GraficoPace data={graphData} />
      </div>
    </div>
  );
}

function Home() {
  const [trainingProgram, setTrainingProgram] = useState<TrainingPlan | null>(
    null
  );
  const [loadingProgram, setLoadingProgram] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlanSaved, setIsPlanSaved] = useState<boolean>(false);
  const [savingPlan, setSavingPlan] = useState<boolean>(false);

  // Retrieve params from URL
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const progression_rate = params.get("progression_rate");
  const phase_duration = params.get("phase_duration");
  const training_frequency = params.get("training_frequency");
  const program_distance = params.get("program_distance");
  const race_dist = params.get("race_dist");
  const race_time = params.get("race_time");
  const initial_volume = params.get("initial_volume");
  const name = params.get("name");

  const parsedProgressionRate = parseRequiredNumberParam(progression_rate);
  const parsedPhaseDuration = parseRequiredNumberParam(phase_duration);
  const parsedTrainingFrequency = parseRequiredNumberParam(training_frequency);
  const parsedProgramDistance = parseRequiredNumberParam(program_distance);
  const parsedRaceDist = parseOptionalNumberParam(race_dist);
  const parsedRaceTime = parseOptionalNumberParam(race_time);
  const parsedInitialVolume = parseOptionalNumberParam(initial_volume);

  const tabTriggerStyle =
    "w-1/3 data-[state=active]:bg-[#d4a54f] data-[state=active]:text-[#121212] data-[state=active]:font-semibold";

  // Effect 1: Generate the training program
  useEffect(() => {
    const fetchTrainingProgram = async (
      progression_rate: number,
      phase_duration: number,
      training_frequency: number,
      program_distance: number,
      race_dist?: number,
      race_time?: number,
      initial_volume?: number
    ) => {
      try {
        setErrorMessage(null);
        const result = await getTrainingProgram({
          progression_rate,
          phase_duration,
          training_frequency,
          program_distance,
          race_dist,
          race_time,
          initial_volume,
        });

        if (result.success) {
          setTrainingProgram(result.data);
        } else {
          setErrorMessage(
            "Nao foi possivel gerar o plano com os dados recebidos."
          );
        }
      } catch (err) {
        console.log(err);
        setErrorMessage("Erro ao comunicar com o servico de planos.");
      } finally {
        setLoadingProgram(false);
      }
    };

    const requiredParams = {
      progression_rate: parsedProgressionRate,
      phase_duration: parsedPhaseDuration,
      training_frequency: parsedTrainingFrequency,
      program_distance: parsedProgramDistance,
    };

    const missingOrInvalidParams = Object.entries(requiredParams)
      .filter(([, value]) => value === null)
      .map(([key]) => key);

    if (missingOrInvalidParams.length > 0) {
      setErrorMessage(
        `Parametros obrigatorios em falta ou invalidos: ${missingOrInvalidParams.join(
          ", "
        )}.`
      );
      setLoadingProgram(false);
      return;
    }

    fetchTrainingProgram(
      parsedProgressionRate as number,
      parsedPhaseDuration as number,
      parsedTrainingFrequency as number,
      parsedProgramDistance as number,
      parsedRaceDist,
      parsedRaceTime,
      parsedInitialVolume
    );
  }, [
    parsedInitialVolume,
    parsedPhaseDuration,
    parsedProgramDistance,
    parsedProgressionRate,
    parsedRaceDist,
    parsedRaceTime,
    parsedTrainingFrequency,
  ]);

  // Effect 2: Save the plan to the database once it's generated
  useEffect(() => {
    if (!trainingProgram || isPlanSaved || savingPlan) return;

    const savePlanToDatabase = async () => {
      setSavingPlan(true);
      try {
        // Prepare plan params
        const planParams = {
          vdot: null, // Will be extracted from race_time calculation if available
          progression_rate: parsedProgressionRate,
          phase_duration: parsedPhaseDuration,
          training_frequency: parsedTrainingFrequency,
          program_distance: parsedProgramDistance,
          race_dist: parsedRaceDist || null,
          race_time: parsedRaceTime || null,
          initial_volume: parsedInitialVolume || null,
          athlete_name: name || null,
        };

        const response = await fetch("/.netlify/functions/save-plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan_data: trainingProgram,
            plan_params: planParams,
          }),
        });

        if (response.ok) {
          setIsPlanSaved(true);
          console.log("Plan saved successfully");
        } else {
          console.warn("Failed to save plan, but plan is still displayed");
        }
      } catch (err) {
        console.warn("Error saving plan to database:", err);
        // Don't stop displaying the plan if save fails
      } finally {
        setSavingPlan(false);
      }
    };

    savePlanToDatabase();
  }, [trainingProgram, isPlanSaved, savingPlan, parsedProgressionRate, parsedPhaseDuration, parsedTrainingFrequency, parsedProgramDistance, parsedRaceDist, parsedRaceTime, parsedInitialVolume, name]);

  if (loadingProgram) {
    return (
      <div className="min-h-screen flex flex-row items-center justify-center gap-3 text-[#e4e8ef]">
        <ImSpinner11 className="animate-spin text-[#d4a54f]" size={30} />
        <p className="text-3xl font-bold tracking-wide">A gerar plano LHT...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-xl w-full bg-[#1f1f1ff2] border border-[#8a3c3c] rounded-xl p-5">
          <h2 className="text-xl font-bold text-[#ffd4d4] mb-2">Erro no plano</h2>
          <p className="text-[#ffd4d4]">{errorMessage}</p>
          <p className="text-[#ffd4d4] mt-2 text-sm">
            Confirma que a URL contem os parametros obrigatorios: progression_rate,
            phase_duration, training_frequency, program_distance.
          </p>
          <Link
            to="/formulario"
            className="inline-block mt-4 px-4 py-2 rounded-md bg-[#d4a54f] text-[#111111] text-sm font-semibold hover:bg-[#c29740]"
          >
            Abrir formulario de plano
          </Link>
        </div>
      </div>
    );
  }

  if (trainingProgram) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center px-3 pb-10">
        {/* Titulo e Nome da Pessoa */}
        <h1 className="mt-6 text-3xl font-semibold text-[#f4f6fa]">Plano de Treino LHT</h1>
        <h2 className="text-lg font-semibold text-[#c9ced9]">{name}</h2>
        
        {/* Plan save status indicator */}
        {savingPlan && (
          <div className="mt-2 px-3 py-1 rounded-full bg-[#d4a54f22] border border-[#d4a54f] text-[#d4a54f] text-xs font-medium">
            A guardar plano...
          </div>
        )}
        {isPlanSaved && (
          <div className="mt-2 px-3 py-1 rounded-full bg-[#2f855a22] border border-[#2f855a] text-[#8fe3b8] text-xs font-medium">
            ✓ Plano guardado
          </div>
        )}
        
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/formulario"
            className="px-4 py-2 rounded-md bg-[#d4a54f] text-[#121212] text-sm font-semibold hover:bg-[#c29740]"
          >
            Gerar novo plano
          </Link>
          <a
            href="https://chat.whatsapp.com/JVsqO05fm4kLhbSaSiKL8n"
            target="_blank"
            rel="noopener"
            className="px-4 py-2 rounded-md bg-[#1f4f37] text-[#d9f6e5] text-sm font-semibold hover:bg-[#256145]"
          >
            Comunidade LHT
          </a>
        </div>
        {/* Escolha de Fase */}
        <Tabs
          defaultValue="fase1"
          className="w-full max-w-6xl flex flex-col items-center mt-6"
        >
          <TabsList className="w-full md:w-3/4 mb-6 bg-[#171717] border border-[#d4a54f33]">
            <TabsTrigger className={tabTriggerStyle} value="fase1">
              Fase 1
            </TabsTrigger>
            <TabsTrigger className={tabTriggerStyle} value="fase2">
              Fase 2
            </TabsTrigger>
            <TabsTrigger className={tabTriggerStyle} value="fase3">
              Fase 3
            </TabsTrigger>
          </TabsList>
          {/* Treinos Fase 1 */}
          <TabsContent
            className="w-full px-2 flex flex-col gap-5"
            value="fase1"
          >
            {Object.keys(trainingProgram.phase1).map((_week, index) => (
              <Accordion
                type="single"
                collapsible
                className="bg-[#1a1a1a] rounded-xl gap-2 border border-[#d4a54f33] border-l-[10px] border-l-[#d4a54f]"
              >
                <AccordionItem value={`phase1-${index}`}>
                  <AccordionTrigger className="ml-2 text-md px-2 flex flex-row items-center justify-between py-6">
                    <p className="text-lg font-bold">Semana {index + 1}</p>
                    <div></div>
                    <div className="flex flex-row items-center gap-1 -mr-8">
                      <FaRunning size={20} />
                      <p className="text-md">
                        {trainingProgram.phase1[
                          index as keyof typeof trainingProgram.phase1
                        ]
                          .reduce(
                            (sum, training) =>
                              sum + training.total_training_distance,
                            0
                          )
                          .toFixed(1)}
                        km
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className=" px-2 flex flex-col">
                    {trainingProgram.phase1[
                      index as keyof typeof trainingProgram.phase2
                    ].map((training) => (
                      <TrainingSessionCard training={training} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ))}
          </TabsContent>
          {/* Treinos Fase 2 */}
          <TabsContent
            value="fase2"
            className="w-full px-2 flex flex-col gap-5"
          >
            {Object.keys(trainingProgram.phase2).map((_week, index) => (
              <Accordion
                type="single"
                collapsible
                className="bg-[#1a1a1a] rounded-xl gap-2 border border-[#d4a54f33] border-l-[10px] border-l-[#d4a54f]"
              >
                <AccordionItem value={`phase2-${index}`}>
                  <AccordionTrigger className="ml-2 text-md px-2 flex flex-row items-center justify-between py-6">
                    <p className="text-lg font-bold">Semana {index + 1}</p>
                    <div></div>
                    <div className="flex flex-row items-center gap-1 -mr-8">
                      <FaRunning size={20} />
                      <p className="text-md">
                        {trainingProgram.phase2[
                          index as keyof typeof trainingProgram.phase2
                        ]
                          .reduce(
                            (sum, training) =>
                              sum + training.total_training_distance,
                            0
                          )
                          .toFixed(1)}
                        km
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className=" px-2 flex flex-col">
                    {trainingProgram.phase2[
                      index as keyof typeof trainingProgram.phase2
                    ].map((training) => (
                      <TrainingSessionCard training={training} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ))}
          </TabsContent>
          {/* Treinos Fase 3  */}
          <TabsContent
            value="fase3"
            className="w-full px-2 flex flex-col gap-5"
          >
            {Object.keys(trainingProgram.phase3).map((_week, index) => (
              <Accordion
                type="single"
                collapsible
                className="bg-[#1a1a1a] rounded-xl gap-2 border border-[#d4a54f33] border-l-[10px] border-l-[#d4a54f]"
              >
                <AccordionItem value={`phase3-${index}`}>
                  <AccordionTrigger className="ml-2 text-md px-2 flex flex-row items-center justify-between py-6">
                    <p className="text-lg font-bold">Semana {index + 1}</p>
                    <div></div>
                    <div className="flex flex-row items-center gap-1 -mr-8">
                      <FaRunning size={20} />
                      <p className="text-md">
                        {trainingProgram.phase3[
                          index as keyof typeof trainingProgram.phase3
                        ]
                          .reduce(
                            (sum, training) =>
                              typeof training.total_training_distance ===
                                "number" &&
                              !isNaN(training.total_training_distance)
                                ? sum + training.total_training_distance
                                : sum,
                            0
                          )
                          .toFixed(1)}
                        km
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className=" px-2 flex flex-col">
                    {trainingProgram.phase3[
                      index as keyof typeof trainingProgram.phase3
                    ].map((training) => (
                      <TrainingSessionCard training={training} compactSplit />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-[#1f1f1ff2] border border-[#d4a54f33] rounded-xl p-5">
        <h2 className="text-xl font-bold mb-2 text-[#f4f6fa]">Sem dados de plano</h2>
        <p className="text-[#c9ced9]">
          O servico respondeu sem dados para os parametros enviados.
        </p>
        <Link
          to="/formulario"
          className="inline-block mt-4 px-4 py-2 rounded-md bg-[#d4a54f] text-[#111111] text-sm font-semibold hover:bg-[#c29740]"
        >
          Preencher formulario
        </Link>
      </div>
    </div>
  );
}

export default Home;
