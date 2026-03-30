import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { fetchAthleteProfile, saveAthleteProfile } from '@/services/athlete-profile';
import type { AthleteOutletContext } from '@/components/atleta/AthleteLayout';

type ProfileForm = {
  fullName: string;
  phone: string;
  goalDistance: string;
  weeklyFrequency: string;
  experienceLevel: string;
  consistencyLevel: string;
  dateOfBirth: string;
  heightCm: string;
  weightKg: string;
  sex: 'male' | 'female' | 'other' | '';
};

const REQUIRED_FIELDS: Array<keyof ProfileForm> = [
  'fullName',
  'goalDistance',
  'weeklyFrequency',
  'experienceLevel',
  'consistencyLevel',
  'dateOfBirth',
  'heightCm',
  'weightKg',
  'sex',
];

export default function AtletaPerfilPage() {
  return <PerfilContent />;
}

function PerfilContent() {
  const navigate = useNavigate();
  const { setProfileComplete } = useOutletContext<AthleteOutletContext>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm>({
    fullName: '',
    phone: '',
    goalDistance: '',
    weeklyFrequency: '',
    experienceLevel: '',
    consistencyLevel: '',
    dateOfBirth: '',
    heightCm: '',
    weightKg: '',
    sex: '',
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAthleteProfile();
        if (!mounted) return;
        setIsEditing(!!data.profileComplete);
        setForm({
          fullName: data.onboarding.fullName || data.athlete.name || '',
          phone: data.onboarding.phone || '',
          goalDistance: data.onboarding.goalDistance ? String(data.onboarding.goalDistance) : '',
          weeklyFrequency: data.onboarding.weeklyFrequency ? String(data.onboarding.weeklyFrequency) : '',
          experienceLevel: data.onboarding.experienceLevel || '',
          consistencyLevel: data.onboarding.consistencyLevel || '',
          dateOfBirth: data.athlete.dateOfBirth || '',
          heightCm: data.athlete.heightCm ? String(data.athlete.heightCm) : '',
          weightKg: data.athlete.weightKg ? String(data.athlete.weightKg) : '',
          sex: data.athlete.sex || '',
        });
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Nao foi possivel carregar o perfil.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const missingCount = useMemo(() => {
    return REQUIRED_FIELDS.reduce((acc, field) => {
      const value = String(form[field] ?? '').trim();
      return value ? acc : acc + 1;
    }, 0);
  }, [form]);

  const handleChange = (field: keyof ProfileForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setError(null);

    if (!form.fullName.trim()) return setError('Indica o teu nome completo.');
    if (!form.goalDistance.trim()) return setError('Indica a tua distancia de objetivo.');
    if (!form.weeklyFrequency.trim()) return setError('Indica a frequencia semanal.');
    if (!form.experienceLevel.trim()) return setError('Seleciona o teu nivel de experiencia.');
    if (!form.consistencyLevel.trim()) return setError('Seleciona o teu nivel de consistencia.');
    if (!form.dateOfBirth.trim()) return setError('Indica a tua data de nascimento.');
    if (!form.heightCm.trim()) return setError('Indica a tua altura em cm.');
    if (!form.weightKg.trim()) return setError('Indica o teu peso em kg.');
    if (!form.sex) return setError('Seleciona o teu sexo.');

    setSaving(true);
    try {
      const updated = await saveAthleteProfile({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        goalDistance: Number(form.goalDistance),
        weeklyFrequency: Number(form.weeklyFrequency),
        experienceLevel: form.experienceLevel,
        consistencyLevel: form.consistencyLevel,
        dateOfBirth: form.dateOfBirth,
        heightCm: Number(form.heightCm),
        weightKg: Number(form.weightKg),
        sex: form.sex,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      if (updated.profileComplete) {
        setProfileComplete(true);
        // First-time completion → go to dashboard; editing → stay on page
        if (!isEditing) {
          navigate('/atleta', { replace: true });
        } else {
          setIsEditing(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nao foi possivel guardar os dados.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#d4a54f] border-t-transparent" />
      </div>
    );
  }

  const totalFields = REQUIRED_FIELDS.length;
  const filledFields = totalFields - missingCount;
  const progressPct = Math.round((filledFields / totalFields) * 100);

  return (
    <div className="flex items-start justify-center px-5 pb-8 pt-6 text-[#e4e8ef]">
      <div className="w-full max-w-xl rounded-[28px] border border-[#d4a54f29] bg-[#121212] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.36)]">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#d4a54f]">Perfil do Atleta</p>
          <h1 className="mt-2 font-['Oswald'] text-3xl font-semibold uppercase tracking-[0.04em] text-[#f7f1e8]">
            {isEditing ? 'O Meu Perfil' : 'Completar Registo'}
          </h1>
          <p className="mt-2 text-sm text-[#a9b2bf]">
            {missingCount > 0
              ? `Faltam ${missingCount} campos para ativar totalmente a tua conta.`
              : 'Perfil completo.'}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#8f99a8]">
            <span>Progresso</span>
            <span>{progressPct}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#1f1f1f]">
            <div
              className="h-full rounded-full bg-[#d4a54f] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Input label="Nome completo" value={form.fullName} onChange={(v) => handleChange('fullName', v)} />
          <Input label="Telemovel" value={form.phone} onChange={(v) => handleChange('phone', v)} placeholder="Opcional" />
          <Input label="Distancia objetivo (km)" type="number" value={form.goalDistance} onChange={(v) => handleChange('goalDistance', v)} />
          <Input label="Sessoes por semana" type="number" value={form.weeklyFrequency} onChange={(v) => handleChange('weeklyFrequency', v)} />

          <Select
            label="Nivel de experiencia"
            value={form.experienceLevel}
            onChange={(v) => handleChange('experienceLevel', v)}
            options={[
              { value: '', label: 'Seleciona...' },
              { value: 'iniciante', label: 'Iniciante' },
              { value: 'intermedio', label: 'Intermedio' },
              { value: 'avancado', label: 'Avancado' },
            ]}
          />

          <Select
            label="Nivel de consistencia"
            value={form.consistencyLevel}
            onChange={(v) => handleChange('consistencyLevel', v)}
            options={[
              { value: '', label: 'Seleciona...' },
              { value: 'baixo', label: 'Baixo' },
              { value: 'medio', label: 'Medio' },
              { value: 'alto', label: 'Alto' },
            ]}
          />

          <Input label="Data de nascimento" type="date" value={form.dateOfBirth} onChange={(v) => handleChange('dateOfBirth', v)} />
          <Input label="Altura (cm)" type="number" value={form.heightCm} onChange={(v) => handleChange('heightCm', v)} />
          <Input label="Peso (kg)" type="number" value={form.weightKg} onChange={(v) => handleChange('weightKg', v)} />

          <Select
            label="Sexo"
            value={form.sex}
            onChange={(v) => handleChange('sex', v as ProfileForm['sex'])}
            options={[
              { value: '', label: 'Seleciona...' },
              { value: 'male', label: 'Masculino' },
              { value: 'female', label: 'Feminino' },
              { value: 'other', label: 'Outro' },
            ]}
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-[#7c1f1f] bg-[#2a1111] px-3 py-2 text-xs text-[#ffd4d4]">{error}</p>
        ) : null}

        {success ? (
          <p className="mt-4 rounded-lg border border-[#238636] bg-[#0d1f0d] px-3 py-2 text-xs text-[#3fb950]">Perfil guardado com sucesso!</p>
        ) : null}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-[linear-gradient(180deg,#e3b861,#d4a54f_55%,#bf8e3e)] px-4 py-3 text-sm font-semibold text-[#111111] shadow-[0_8px_24px_rgba(212,165,79,0.3)] disabled:opacity-70"
        >
          {saving ? 'A guardar...' : isEditing ? 'Guardar Alterações' : 'Guardar e Continuar'}
        </button>
      </div>
    </div>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-xs text-[#a9b2bf]">
      <span>{props.label}</span>
      <input
        type={props.type || 'text'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f7f1e8]"
      />
    </label>
  );
}

function Select(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-xs text-[#a9b2bf]">
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-[#2f2f2f] bg-[#0f0f0f] px-3 py-2 text-sm text-[#f7f1e8]"
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
