import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FaRunning } from "react-icons/fa";
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

function Home() {
  const [trainingProgram, setTrainingProgram] = useState<TrainingPlan | null>(
    null
  );
  const [loadingProgram, setLoadingProgram] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    "w-1/3 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:font-semibold";

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

  if (loadingProgram) {
    return (
      <div className="w-screen h-screen flex flex-row items-center justify-center gap-2">
        <ImSpinner11 className="animate-spin" size={30} />
        <p className="text-4xl font-sans font-bold">Loading Program</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="w-screen h-screen flex items-center justify-center px-4">
        <div className="max-w-xl w-full bg-red-50 border border-red-200 rounded-xl p-5">
          <h2 className="text-xl font-bold text-red-800 mb-2">Erro no plano</h2>
          <p className="text-red-700">{errorMessage}</p>
          <p className="text-red-700 mt-2 text-sm">
            Confirma que a URL contem os parametros obrigatorios: progression_rate,
            phase_duration, training_frequency, program_distance.
          </p>
          <Link
            to="/formulario"
            className="inline-block mt-4 px-4 py-2 rounded-md bg-red-700 text-white text-sm font-semibold hover:bg-red-800"
          >
            Abrir formulario de plano
          </Link>
        </div>
      </div>
    );
  }

  if (trainingProgram) {
    return (
      <div className="w-full flex flex-col items-center">
        {/* Titulo e Nome da Pessoa */}
        <h1 className="text-2xl font-semibold">Plano de Treino</h1>
        <h2 className="text-lg font-semibold text-muted-foreground">{name}</h2>
        <Link
          to="/formulario"
          className="mt-3 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          Gerar novo plano
        </Link>
        {/* Escolha de Fase */}
        <Tabs
          defaultValue="fase1"
          className="w-full flex flex-col items-center mt-4"
        >
          <TabsList className="w-3/4 mb-6">
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
                className="bg-gray-100 rounded-xl gap-2 border-l-[12px] border-blue-500"
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
                      <div className=" bg-gray-200 p-2 rounded-md mb-2">
                        {/* Título e Distância */}
                        <div className="w-full flex flex-row items-center justify-between ">
                          <h2 className="font-bold text-[16px]">
                            {training.training_title_pt}
                          </h2>
                          <div></div>
                          <div className="flex flex-row items-center gap-1">
                            <FaRunning size={16} />
                            <p className="text-sm">
                              {training.total_training_distance}km
                            </p>
                          </div>
                        </div>
                        {/* Descrição */}
                        <p className="text-muted-foreground italic">
                          {training.training_description_pt}
                        </p>

                        {/* String */}
                        <p className="text-muted-foreground italic mt-1">
                          {splitStringFormatted(training.split_string)}
                        </p>

                        {/* Gráfico */}
                        <div className="w-full h-[150px] mt-4">
                          <GraficoPace
                            data={processData(training.split_string[1])}
                          />
                        </div>
                      </div>
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
                className="bg-gray-100 rounded-xl gap-2 border-l-[12px] border-blue-500"
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
                      <div className=" bg-gray-200 p-2 rounded-md mb-2">
                        {/* Título e Distância */}
                        <div className="w-full flex flex-row items-center justify-between ">
                          <h2 className="font-bold text-[16px]">
                            {training.training_title_pt}
                          </h2>
                          <div></div>
                          <div className="flex flex-row items-center gap-1">
                            <FaRunning size={16} />
                            <p className="text-sm">
                              {training.total_training_distance}km
                            </p>
                          </div>
                        </div>
                        {/* Descrição */}
                        <p className="text-muted-foreground italic">
                          {training.training_description_pt}
                        </p>

                        {/* String */}
                        <p className="text-muted-foreground italic mt-1">
                          {splitStringFormatted(training.split_string)}
                        </p>

                        {/* Gráfico */}
                        <div className="w-full h-[150px] mt-4">
                          <GraficoPace
                            data={processData(training.split_string[1])}
                          />
                        </div>
                      </div>
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
                className="bg-gray-100 rounded-xl gap-2 border-l-[12px] border-blue-500"
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
                      <div className=" bg-gray-200 p-2 rounded-md mb-2">
                        {/* Título e Distância */}
                        <div className="w-full flex flex-row items-center justify-between ">
                          <h2 className="font-bold text-[16px]">
                            {training.training_title_pt}
                          </h2>
                          <div></div>
                          <div className="flex flex-row items-center gap-1">
                            <FaRunning size={16} />
                            <p className="text-sm">
                              {training.total_training_distance}km
                            </p>
                          </div>
                        </div>
                        {/* Descrição */}
                        <p className="text-muted-foreground italic">
                          {training.training_description_pt}
                        </p>

                        {/* String */}
                        <p className="text-xs text-muted-foreground mt-3">
                          {splitStringFormatted(training.split_string)}
                        </p>

                        {/* Gráfico */}
                        <div className="w-full h-[150px] mt-4">
                          <GraficoPace
                            data={processData(training.split_string[1])}
                          />
                        </div>
                      </div>
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
    <div className="w-screen h-screen flex items-center justify-center px-4">
      <div className="max-w-xl w-full bg-gray-100 border border-gray-200 rounded-xl p-5">
        <h2 className="text-xl font-bold mb-2">Sem dados de plano</h2>
        <p className="text-gray-700">
          O servico respondeu sem dados para os parametros enviados.
        </p>
        <Link
          to="/formulario"
          className="inline-block mt-4 px-4 py-2 rounded-md bg-gray-800 text-white text-sm font-semibold hover:bg-gray-900"
        >
          Preencher formulario
        </Link>
      </div>
    </div>
  );
}

export default Home;
