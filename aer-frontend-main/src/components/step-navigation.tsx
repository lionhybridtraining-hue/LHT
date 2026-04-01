interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  canAdvance: boolean;
  isLoading?: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export default function StepNavigation({
  currentStep,
  totalSteps,
  canAdvance,
  isLoading = false,
  onPrev,
  onNext,
}: StepNavigationProps) {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {!isFirstStep && (
        <button
          type="button"
          disabled={isLoading}
          onClick={onPrev}
          className="w-full sm:w-auto px-5 py-3 rounded-md border border-[#d4a54f66] bg-[rgba(255,255,255,0.03)] text-[#e4e8ef] font-semibold hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Anterior
        </button>
      )}
      
      <button
        type="button"
        disabled={!canAdvance || isLoading}
        onClick={onNext}
        className={`w-full sm:w-auto px-5 py-3 rounded-md font-semibold ${
          isLastStep
            ? "bg-[#d4a54f] text-[#111111] hover:bg-[#c29740] disabled:opacity-50 disabled:cursor-not-allowed"
            : "bg-[#d4a54f] text-[#111111] hover:bg-[#c29740] disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {isLoading ? "A processar..." : isLastStep ? "Gerar o meu Plano LHT" : "Próximo →"}
      </button>
    </div>
  );
}
