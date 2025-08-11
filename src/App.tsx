import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend,
} from "recharts";

/* ====================== Utilities ====================== */
const pct = (n: number) => (isFinite(n) ? (n * 100).toFixed(0) + "%" : "-");
const fmt = (n: number) => (isFinite(n) ? n.toLocaleString("th-TH", { maximumFractionDigits: 0 }) : "-");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function annuityCorpus(annualNeedAtRetire: number, rAfter: number, years: number) {
  if (years <= 0) return 0;
  if (rAfter === 0) return annualNeedAtRetire * years;
  const factor = (1 - Math.pow(1 + rAfter, -years)) / rAfter;
  return annualNeedAtRetire * factor;
}
function fv(pv: number, r: number, n: number) { return pv * Math.pow(1 + r, n); }
function fvSeries(pmtPerYear: number, r: number, n: number) {
  if (n <= 0) return 0;
  if (r === 0) return pmtPerYear * n;
  return pmtPerYear * ((Math.pow(1 + r, n) - 1) / r);
}
function requiredSavingsPerYear(targetFV: number, currentAssets: number, r: number, years: number) {
  const fvAssets = fv(currentAssets, r, years);
  const need = Math.max(targetFV - fvAssets, 0);
  if (need === 0) return 0;
  if (r === 0) return need / years;
  return (need * r) / (Math.pow(1 + r, years) - 1);
}
function pmtMonthly(principal: number, rateYear: number, years: number) {
  const r = rateYear / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/* ====================== App ====================== */
export default function App() {
  // --- Retirement core ---
  const [age, setAge] = useState(36);
  const [retireAge, setRetireAge] = useState(60);
  const [lifeExpectancy, setLifeExpectancy] = useState(90);
  const [inflation, setInflation] = useState(0.03);
  const [returnBefore, setReturnBefore] = useState(0.06);
  const [returnAfter, setReturnAfter] = useState(0.035);

  // Income & Expense (simple)
  const [incomeMain, setIncomeMain] = useState(60000);
  const [incomeSide, setIncomeSide] = useState(10000);
  const [expBasic, setExpBasic] = useState(30000);
  const [expHealth, setExpHealth] = useState(4000);
  const [expLifestyle, setExpLifestyle] = useState(8000);

  // Assets & Saving
  const [currentAssets, setCurrentAssets] = useState(0);
  const [currentDebt, setCurrentDebt] = useState(0);
  const [currentSavingPerMonth, setCurrentSavingPerMonth] = useState(0);

  // Tax (kept minimal here)
  const [pvdRate, setPvdRate] = useState(0.05);

  // Debt Planner
  const [mortgage, setMortgage] = useState({ principal: 2_000_000, rate: 0.055, years: 25 });
  const [carLoan, setCarLoan] = useState({ principal: 400_000, rate: 0.06, years: 5 });
  const mortgagePmt = pmtMonthly(mortgage.principal, mortgage.rate, mortgage.years);
  const carPmt = pmtMonthly(carLoan.principal, carLoan.rate, carLoan.years);

  // Goals
  type Goal = { id: string; name: string; target: number; year: number; priority: number };
  const [goals, setGoals] = useState<Goal[]>([
    { id: "g1", name: "กองทุนฉุกเฉิน", target: 120_000, year: new Date().getFullYear(), priority: 10 },
    { id: "g2", name: "ท่องเที่ยว", target: 80_000, year: new Date().getFullYear() + 1, priority: 3 },
  ]);

  // Protection (simple heuristics)
  const [lifeCoverHave, setLifeCoverHave] = useState(0);
  const [ciCoverHave, setCiCoverHave] = useState(0);
  const [healthBudget, setHealthBudget] = useState(0);
  const incomeYear = (incomeMain + incomeSide) * 12;
  const monthlyExpense = expBasic + expHealth + expLifestyle;

  const yearsToRetire = Math.max(retireAge - age, 0);
  const yearsInRetirement = Math.max(lifeExpectancy - retireAge, 0);
  const annualExpenseToday = monthlyExpense * 12;
  const annualExpenseAtRetire = annualExpenseToday * Math.pow(1 + inflation, yearsToRetire);
  const targetCorpus = annuityCorpus(annualExpenseAtRetire, returnAfter, yearsInRetirement);

  const projectedFVAtRetire = useMemo(() => {
    const yearlySaving = currentSavingPerMonth * 12 + incomeYear * pvdRate;
    const fromAssets = fv(Math.max(currentAssets - currentDebt, 0), returnBefore, yearsToRetire);
    const fromFutureSavings = fvSeries(yearlySaving, returnBefore, yearsToRetire);
    const spendGoals = goals
      .filter(g => g.year <= new Date().getFullYear() + yearsToRetire)
      .map(g => g.target * Math.pow(1 + inflation, g.year - new Date().getFullYear()))
      .reduce((a, b) => a + b, 0);
    return Math.max(fromAssets + fromFutureSavings - spendGoals, 0);
  }, [currentAssets, currentDebt, currentSavingPerMonth, returnBefore, yearsToRetire, goals, incomeYear, pvdRate, inflation]);

  const requiredSavingPerYear = requiredSavingsPerYear(
    targetCorpus,
    Math.max(currentAssets - currentDebt, 0),
    returnBefore,
    yearsToRetire
  );
  const requiredSavingPerMonth = requiredSavingPerYear / 12;
  const readiness = targetCorpus > 0 ? projectedFVAtRetire / targetCorpus : 0;

  const yearsToProtect = clamp( (childrenCountGuess(monthlyExpense) ? 20 : 10), 5, 25 );
  const lifeNeed = Math.max(
    incomeYear * yearsToProtect + (mortgage.principal + carLoan.principal) + educationReserveGuess(monthlyExpense)
    - Math.max(currentAssets - currentDebt, 0) - lifeCoverHave,
    0
  );
  const ciNeed = Math.max( (incomeYear * 3) - ciCoverHave, 0 );

  // Scenario sliders
  const [bearShock, setBearShock] = useState(-0.2);
  const [stdevBefore, setStdevBefore] = useState(0.10);
  const [stdevAfter, setStdevAfter] = useState(0.05);

  // Monte Carlo (fast & rough)
  const [runs, setRuns] = useState(500);
  const mc = useMemo(() => {
    const results: number[] = [];
    const horizonYears = lifeExpectancy - age;
    for (let i = 0; i < runs; i++) {
      let wealth = Math.max(currentAssets - currentDebt, 0);
      let ok = true;
      for (let y = 0; y <= horizonYears; y++) {
        const currentAge = age + y;
        if (currentAge < retireAge) {
          const r = randomNormal(returnBefore, stdevBefore);
          wealth = wealth * (1 + r) + (currentSavingPerMonth + incomeYear * pvdRate / 12) * 12;
          if (y === 0) wealth *= 1 + bearShock;
        } else {
          const r = randomNormal(returnAfter, stdevAfter);
          const yearsFromRetire = currentAge - retireAge;
          const need = annualExpenseAtRetire * Math.pow(1 + inflation, yearsFromRetire);
          wealth = wealth * (1 + r) - need;
          if (wealth <= 0) { ok = false; break; }
        }
      }
      results.push(ok ? 1 : 0);
    }
    const prob = results.reduce((a,b)=>a+b,0)/Math.max(runs,1);
    return { successProb: prob };
  }, [runs, age, retireAge, lifeExpectancy, currentAssets, currentDebt, currentSavingPerMonth, incomeYear, pvdRate, returnBefore, returnAfter, stdevBefore, stdevAfter, bearShock, annualExpenseAtRetire, inflation]);

  // Wealth curve (deterministic)
  const chartData = useMemo(() => {
    const data: { age: number; wealth: number; draw?: number }[] = [];
    let wealth = Math.max(currentAssets - currentDebt, 0);
    for (let y = 0; y <= lifeExpectancy - age; y++) {
      const currentAge = age + y;
      if (currentAge < retireAge) {
        wealth = wealth * (1 + returnBefore) + (currentSavingPerMonth + incomeYear * pvdRate / 12) * 12;
      } else {
        const yearsFromRetire = currentAge - retireAge;
        const need = annualExpenseAtRetire * Math.pow(1 + inflation, yearsFromRetire);
        wealth = wealth * (1 + returnAfter) - need;
        data.push({ age: currentAge, wealth: Math.max(wealth, 0), draw: need });
        continue;
      }
      data.push({ age: currentAge, wealth: Math.max(wealth, 0) });
    }
    return data;
  }, [age, lifeExpectancy, retireAge, returnBefore, returnAfter, currentSavingPerMonth, currentAssets, currentDebt, annualExpenseAtRetire, inflation, incomeYear, pvdRate]);

  const printReport = () => window.print();

  /* ====================== UI ====================== */
  const totalIncome = incomeMain + incomeSide;
  const totalExpense = expBasic + expHealth + expLifestyle;

  return (
    <div className="min-h-screen bg-[var(--pj-bg)] text-[var(--pj-text)]">
      <div className="mx-auto max-w-7xl p-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[var(--pj-primary)]/10 grid place-items-center text-[var(--pj-primary)] font-bold">PO</div>
            <h1 className="text-xl md:text-2xl font-bold">แผนอุ่นใจ – Thai Retirement Planner</h1>
          </div>
          <button onClick={printReport}
            className="rounded-full bg-[var(--pj-primary)] text-white px-4 py-2 shadow hover:opacity-90">
            พิมพ์/บันทึกเป็น PDF
          </button>
        </header>

        {/* Summary Row */}
        <section className="grid xl:grid-cols-5 md:grid-cols-3 gap-4">
          <StatCard label="พร้อมแล้ว" value={pct(Math.min(readiness,1))}
            sub={`เป้าหมาย ${fmt(targetCorpus)} บาท`} ok={readiness>=1}/>
          <StatCard label="เงินก้อนคาดมีตอนเกษียณ" value={`${fmt(Math.round(projectedFVAtRetire))} บาท`} />
          <StatCard label="ต้องออม/เดือน" value={`${fmt(Math.ceil(requiredSavingPerMonth))} บาท`} />
          <StatCard label="ค่างวดบ้าน/เดือน" value={`${fmt(Math.round(mortgagePmt))} บาท`} />
          <StatCard label="ค่างวดรถ/เดือน" value={`${fmt(Math.round(carPmt))} บาท`} />
        </section>

        {/* Inputs core */}
        <section className="grid lg:grid-cols-3 gap-6">
          <Panel title="1) อายุ & สมมติฐาน">
            <div className="space-y-3">
              <NumInput label="อายุปัจจุบัน" value={age} onChange={setAge} />
              <NumInput label="อายุเกษียณ" value={retireAge} onChange={setRetireAge} />
              <NumInput label="อายุคาดเฉลี่ย" value={lifeExpectancy} onChange={setLifeExpectancy} />
              <PercentInput label="เงินเฟ้อ/ปี" value={inflation} onChange={setInflation} />
              <PercentInput label="ผลตอบแทนก่อนเกษียณ" value={returnBefore} onChange={setReturnBefore} />
              <PercentInput label="ผลตอบแทนหลังเกษียณ" value={returnAfter} onChange={setReturnAfter} />
            </div>
          </Panel>

          <Panel title="2) รายได้ & ค่าใช้จ่าย">
            <div className="grid md:grid-cols-2 gap-3">
              <NumInput label="รายได้งานประจำ/เดือน" value={incomeMain} onChange={setIncomeMain} />
              <NumInput label="รายได้เสริม/เดือน" value={incomeSide} onChange={setIncomeSide} />
            </div>
            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <NumInput label="Basic/เดือน" value={expBasic} onChange={setExpBasic}/>
              <NumInput label="Health/เดือน" value={expHealth} onChange={setExpHealth}/>
              <NumInput label="Lifestyle/เดือน" value={expLifestyle} onChange={setExpLifestyle}/>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--pj-muted)]">
                <span>สัดส่วนค่าใช้จ่ายต่อรายได้</span>
                <span>{pct(totalIncome ? totalExpense/totalIncome : 0)}</span>
              </div>
              <Meter value={totalIncome ? totalExpense/totalIncome : 0} />
            </div>
          </Panel>

          <Panel title="3) ทรัพย์สิน & ออมตอนนี้">
            <div className="space-y-3">
              <NumInput label="ทรัพย์สินเพื่อเกษียณ (รวม)" value={currentAssets} onChange={setCurrentAssets} />
              <NumInput label="หนี้ที่เกี่ยวข้อง" value={currentDebt} onChange={setCurrentDebt} />
              <NumInput label="กำลังออมอยู่/เดือน" value={currentSavingPerMonth} onChange={setCurrentSavingPerMonth} />
              <PercentInput label="PVD ลูกจ้าง (% รายได้ปี)" value={pvdRate} onChange={setPvdRate} />
            </div>
          </Panel>
        </section>

        {/* Debt & Goals */}
        <section className="grid lg:grid-cols-3 gap-6 items-stretch">
          <Panel title="Debt Planner" >
            <div className="grid md:grid-cols-3 gap-4">
              <NumInput label="บ้าน: ยอดเงินกู้" value={mortgage.principal} onChange={(v)=>setMortgage({ ...mortgage, principal: v })} />
              <PercentInput label="บ้าน: ดอกเบี้ย/ปี" value={mortgage.rate} onChange={(v)=>setMortgage({ ...mortgage, rate: v })} />
              <NumInput label="บ้าน: ระยะปี" value={mortgage.years} onChange={(v)=>setMortgage({ ...mortgage, years: v })} />
              <NumInput label="รถ: ยอดเงินกู้" value={carLoan.principal} onChange={(v)=>setCarLoan({ ...carLoan, principal: v })} />
              <PercentInput label="รถ: ดอกเบี้ย/ปี" value={carLoan.rate} onChange={(v)=>setCarLoan({ ...carLoan, rate: v })} />
              <NumInput label="รถ: ระยะปี" value={carLoan.years} onChange={(v)=>setCarLoan({ ...carLoan, years: v })} />
            </div>
            <div className="text-sm text-slate-600 mt-3">
              รวมค่างวด/เดือนโดยประมาณ: <b>{fmt(Math.round(mortgagePmt + carPmt))}</b> บาท
            </div>
            <div className="text-xs text-slate-500">* แนะนำ: ถ้า DSR (ค่างวดทั้งหมด/รายได้) &gt; 40% ให้พิจารณารีไฟแนนซ์/ยืดงวด</div>

            <div className="mt-4">
              <SectionTitle>Goals</SectionTitle>
              <GoalEditor goals={goals} setGoals={setGoals} />
            </div>
          </Panel>

          <Panel title="Protection Gap">
            <NumInput label="ทุนประกันชีวิตที่มี" value={lifeCoverHave} onChange={setLifeCoverHave} />
            <NumInput label="ทุนประกันโรคร้ายแรง (CI) ที่มี" value={ciCoverHave} onChange={setCiCoverHave} />
            <NumInput label="งบประกันสุขภาพ/ปี (ตั้งเป้า)" value={healthBudget} onChange={setHealthBudget} />
            <div className="text-sm mt-2">
              ควรมีทุนชีวิตเพิ่มราว <b>{fmt(Math.round(lifeNeed))}</b> บาท<br/>
              ควรมีทุน CI เพิ่มราว <b>{fmt(Math.round(ciNeed))}</b> บาท
            </div>
            <div className="text-xs text-slate-500 mt-1">
              * วิธีคิดอย่างย่อ: ทดแทนรายได้ {childrenCountGuess(monthlyExpense)?"20":"10"} ปี + เคลียร์หนี้ + ทุนการศึกษาลูก − สินทรัพย์สุทธิ − ทุนที่มี
            </div>
          </Panel>
        </section>

        {/* Scenarios & Monte Carlo */}
        <section className="grid lg:grid-cols-3 gap-6 items-stretch">
          <Panel title="Scenario & Monte Carlo">
            <div className="grid md:grid-cols-3 gap-4">
              <PercentInput label="ช็อกตลาดปีแรก (ก่อนเกษียณ)" value={bearShock} onChange={setBearShock} />
              <PercentInput label="ส่วนเบี่ยงเบนผลตอบแทนก่อน/ปี (σ)" value={stdevBefore} onChange={setStdevBefore} />
              <PercentInput label="ส่วนเบี่ยงเบนหลัง/ปี (σ)" value={stdevAfter} onChange={setStdevAfter} />
              <NumInput label="จำนวนรัน Monte Carlo" value={runs} onChange={(v)=>setRuns(clamp(v,100,3000))} />
            </div>
            <div className="text-sm mt-2">ความน่าจะเป็นที่เงินไม่หมดก่อนอายุ {lifeExpectancy}: <b>{pct(mc.successProb)}</b></div>
            <div className="h-72 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ name: "ความสำเร็จ", value: mc.successProb }]}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4}/>
                  <XAxis dataKey="name" />
                  <YAxis domain={[0,1]} tickFormatter={(v)=>pct(v)} />
                  <Tooltip formatter={(v:any)=>pct(+v)} contentStyle={{borderRadius:12, borderColor:'var(--pj-border)'}}/>
                  <Bar dataKey="value" radius={[8,8,0,0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="ความมั่งคั่งตลอดชีวิต (คาดการณ์)">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4}/>
                  <XAxis dataKey="age" />
                  <YAxis tickFormatter={(v)=> (v/1_000_000).toFixed(0) + "ล."} />
                  <Tooltip
                    formatter={(v:any)=> fmt(+v) + " บาท"}
                    labelFormatter={(l)=>`อายุ ${l}`}
                    contentStyle={{borderRadius:12, borderColor:'var(--pj-border)'}}
                  />
                  <Line type="monotone" dataKey="wealth" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </section>

        <footer className="text-xs text-[var(--pj-muted)] text-center pt-6">
          Prototype นี้เพื่อการประมาณการเบื้องต้น ไม่ใช่คำแนะนำการลงทุน/ภาษีอย่างเป็นทางการ
        </footer>
      </div>
    </div>
  );
}

/* ====================== Reusable UI ====================== */
function SectionTitle({children}:{children:React.ReactNode}){
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}
function Panel({title,children}:{title?:string;children:React.ReactNode}){
  return (
    <section className="bg-[var(--pj-card)] rounded-[var(--pj-radius)] border border-[var(--pj-border)] shadow-sm p-5">
      {title && <div className="mb-3 text-sm font-medium text-[var(--pj-muted)]">{title}</div>}
      {children}
    </section>
  );
}
function StatCard({label,value,sub,ok}:{label:string;value:string;sub?:string;ok?:boolean}){
  return (
    <div className="bg-[var(--pj-card)] rounded-[var(--pj-radius)] border border-[var(--pj-border)] p-4 shadow-sm">
      <div className="text-[11px] text-[var(--pj-muted)]">{label}</div>
      <div className={`text-2xl font-semibold ${ok?'text-[var(--pj-good)]':'text-[var(--pj-text)]'}`}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--pj-muted)] mt-1">{sub}</div>}
    </div>
  );
}
function Meter({value}:{value:number}){
  return (
    <div className="h-2 w-full bg-[#EEF2F7] rounded-full overflow-hidden">
      <div className="h-full bg-[var(--pj-primary)]" style={{width:`${Math.min(100,Math.max(0,value*100))}%`}}/>
    </div>
  );
}

/* ====================== Inputs ====================== */
type NumInputProps = { label: string; value: number; onChange: (n: number) => void; suffix?: string; };
function NumInput({ label, value, onChange, suffix }: NumInputProps) {
  return (
    <label className="block">
      <div className="text-sm text-slate-600 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number" step="any" inputMode="decimal" pattern="[0-9.]*"
          onWheel={(e) => (e.currentTarget as any).blur()}
          className="w-full rounded-xl border px-3 py-2"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const raw = e.target.value; const num = raw === "" ? 0 : +raw;
            onChange(Number.isNaN(num) ? 0 : num);
          }}
        />
        {suffix && <span className="text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}
type PercentInputProps = { label: string; value: number; onChange: (n: number) => void; };
function PercentInput({ label, value, onChange }: PercentInputProps) {
  return (
    <label className="block">
      <div className="text-sm text-slate-600 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number" step="any" inputMode="decimal" pattern="[0-9.]*"
          onWheel={(e) => (e.currentTarget as any).blur()}
          className="w-full rounded-xl border px-3 py-2"
          value={Math.round((Number.isFinite(value) ? value : 0) * 1000) / 10}
          onChange={(e) => {
            const raw = e.target.value; const num = raw === "" ? 0 : +raw;
            onChange((Number.isNaN(num) ? 0 : num) / 100);
          }}
        />
        <span className="text-slate-500">%</span>
      </div>
    </label>
  );
}

/* ====================== Goals Editor ====================== */
function GoalEditor({
  goals, setGoals,
}: {
  goals: { id: string; name: string; target: number; year: number; priority: number }[];
  setGoals: any;
}) {
  const add = () => setGoals((g: any[]) => [
    ...g, { id: Math.random().toString(36).slice(2), name: "เป้าหมายใหม่", target: 50_000, year: new Date().getFullYear()+1, priority: 5 }
  ]);
  const upd = (id: string, patch: any) => setGoals((gs: any[]) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const del = (id: string) => setGoals((gs: any[]) => gs.filter((g) => g.id !== id));

  const data = [...goals].sort((a,b)=> b.priority - a.priority);
  const totalPerYear: Record<number, number> = {};
  for (const g of data) totalPerYear[g.year] = (totalPerYear[g.year]||0) + g.target;
  const planData = Object.entries(totalPerYear).map(([year, sum]) => ({ year: Number(year), amount: sum }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-[var(--pj-muted)]">จัดลำดับเป้าหมาย (priority สูง = สำคัญก่อน)</div>
        <button className="text-[var(--pj-primary)] text-sm underline" onClick={add}>+ เพิ่มเป้าหมาย</button>
      </div>

      <div className="space-y-2">
        {data.map((g) => (
          <div key={g.id} className="grid md:grid-cols-5 gap-2 items-end bg-slate-50 rounded-xl p-2">
            <input className="rounded border px-2 py-1 md:col-span-2" value={g.name}
              onChange={(e)=>upd(g.id,{name:e.target.value})} />
            <input type="number" className="rounded border px-2 py-1" value={g.target}
              onChange={(e)=>upd(g.id,{target:+e.target.value})} />
            <input type="number" className="rounded border px-2 py-1" value={g.year}
              onChange={(e)=>upd(g.id,{year:+e.target.value})} />
            <input type="number" className="rounded border px-2 py-1" value={g.priority}
              onChange={(e)=>upd(g.id,{priority:+e.target.value})} />
            <button className="text-red-600 text-sm" onClick={()=>del(g.id)}>ลบ</button>
          </div>
        ))}
      </div>

      <div className="h-48 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={planData}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4}/>
            <XAxis dataKey="year" />
            <YAxis tickFormatter={(v)=> (v/1_000_000).toFixed(1)+"ล."} />
            <Tooltip formatter={(v:any)=> fmt(+v)+" บาท"} contentStyle={{borderRadius:12, borderColor:'var(--pj-border)'}} />
            <Bar dataKey="amount" radius={[8,8,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ====================== Heuristics & RNG ====================== */
function childrenCountGuess(monthlyExpense: number) { return monthlyExpense > 40000; }
function educationReserveGuess(monthlyExpense: number) { return childrenCountGuess(monthlyExpense) ? 1_000_000 : 0; }
function randomNormal(mean: number, stdev: number) {
  let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + z * stdev;
}
