interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
}

export default function StepIndicator({
  currentStep,
  totalSteps,
  stepLabels,
}: StepIndicatorProps) {
  const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="mb-8 space-y-3">
      {/* Progress bar */}
      <div className="h-1 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#d4a54f] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Step counter + labels */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#d4a54f]">
          Passo {currentStep} de {totalSteps}
        </span>
        {stepLabels && stepLabels[currentStep - 1] && (
          <span className="text-sm text-[#c9ced9]">{stepLabels[currentStep - 1]}</span>
        )}
      </div>
    </div>
  );
}
