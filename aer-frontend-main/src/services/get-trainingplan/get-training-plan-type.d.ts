declare module "trainingPlanCalculatorAPI" {
  export type trainingPlanApiResponse = {
    data: TrainingPlan | null;
    success: boolean;
    message: string;
  };

  export type TrainingPlan = {
    phase1: { [key: number]: WeeklyTraining };
    phase2: { [key: number]: WeeklyTraining };
    phase3: { [key: number]: WeeklyTraining };
  };

  type WeeklyTraining = {
    training_title_en: string;
    training_title_pt: string;
    training_description_en: string;
    training_description_pt: string;
    total_training_distance: number;
    split_string: string;
  }[];
}
