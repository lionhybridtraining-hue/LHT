import {
  TrainingPlan,
  trainingPlanApiResponse,
} from "trainingPlanCalculatorAPI";

type getTrainingPlanProps = {
  progression_rate: number;
  phase_duration: number;
  training_frequency: number;
  program_distance: number;
  race_dist?: number;
  race_time?: number;
  initial_volume?: number;
};

export default async function getTrainingProgram({
  progression_rate,
  phase_duration,
  training_frequency,
  program_distance,
  race_dist,
  race_time,
  initial_volume,
}: getTrainingPlanProps): Promise<trainingPlanApiResponse> {
  try {
    const apiUrl = import.meta.env.VITE_TRAININGPLAN_API_URL;
    if (!apiUrl) {
      throw new Error("Missing VITE_TRAININGPLAN_API_URL");
    }

    const endpointUrl = new URL(apiUrl);
    endpointUrl.searchParams.set("progression_rate", String(progression_rate));
    endpointUrl.searchParams.set("phase_duration", String(phase_duration));
    endpointUrl.searchParams.set(
      "training_frequency",
      String(training_frequency)
    );
    endpointUrl.searchParams.set("program_distance", String(program_distance));

    if (typeof race_dist === "number" && Number.isFinite(race_dist)) {
      endpointUrl.searchParams.set("race_dist", String(race_dist));
    }
    if (typeof race_time === "number" && Number.isFinite(race_time)) {
      endpointUrl.searchParams.set("race_time", String(race_time));
    }
    if (
      typeof initial_volume === "number" &&
      Number.isFinite(initial_volume)
    ) {
      endpointUrl.searchParams.set("initial_volume", String(initial_volume));
    }

    const response = await fetch(endpointUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const data: TrainingPlan = await response.json();

    return {
      data,
      success: true,
      message: "training program retrieved successfully - ",
    };
  } catch (error) {
    console.log(error);
    return {
      data: null,
      success: false,
      message: `Failed to fetch training program`,
    };
  }
}
