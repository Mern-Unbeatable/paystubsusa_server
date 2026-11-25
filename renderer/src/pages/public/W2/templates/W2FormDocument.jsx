import React from "react";

const BOX13_ITEMS = [
  { label: "Statutory employee", field: "box13StatutoryEmployee" },
  { label: "Retirement plan", field: "box13RetirementPlan" },
  { label: "Third-party sick pay", field: "box13ThirdPartySickPay" },
];

const W2FormDocument = ({ formData }) => (
  <div className="p-3 text-[9px] leading-tight font-sans text-slate-900 select-none">
    {/* Top Row: 22222, Void, SSN, OMB */}
    <div className="grid grid-cols-12 border-b border-slate-400">
      <div className="col-span-2 border-r border-slate-400 p-1 font-bold text-[10px]">
        22222
      </div>
      <div className="col-span-2 border-r border-slate-400 p-1 flex items-center gap-1 text-[8px] text-slate-500">
        <span>Void</span>
        <div className="w-2.5 h-2.5 border border-slate-400" />
      </div>
      <div className="col-span-5 border-r border-slate-400 p-1">
        <span className="text-[7.5px] text-slate-500 block">
          a. Employee's social security number
        </span>
        <strong className="text-[9.5px] tracking-wider">
          {formData.ssn || "000-00-0000"}
        </strong>
      </div>
      <div className="col-span-3 p-1 text-right text-[7.5px] text-slate-500 font-medium">
        OMB No. 1545-0008
      </div>
    </div>

    {/* Upper middle: b–e | boxes 1–9 */}
    <div className="grid grid-cols-12 border-b border-slate-400 items-stretch">
      <div className="col-span-5 border-r border-slate-400">
        <div className="p-1 border-b border-slate-400 min-h-[28px]">
          <span className="text-[7.5px] text-slate-500 block">
            b. Employer identification number (EIN)
          </span>
          <span className="font-semibold">{formData.ein || "12-3456789"}</span>
        </div>

        <div className="p-1 border-b border-slate-400 min-h-[48px]">
          <span className="text-[7.5px] text-slate-500 block">
            c. Employer's name, address, and ZIP code
          </span>
          <p className="font-bold text-[8.5px]">
            {formData.employerName || "Employer Name"}
          </p>
          <p className="text-[8px] text-slate-700">
            {formData.streetAddress || "123 Business St"}
          </p>
          <p className="text-[8px] text-slate-700">
            {formData.city || "City"}, {formData.state || "ST"}{" "}
            {formData.zipCode || "00000"}
          </p>
        </div>

        <div className="p-1 border-b border-slate-400 min-h-[22px]">
          <span className="text-[7.5px] text-slate-500 block">
            d. Control number
          </span>
          <span className="text-[8px]">{formData.controlNumber || ""}</span>
        </div>

        <div className="p-1 min-h-[28px]">
          <span className="text-[7.5px] text-slate-500 block">
            e. Employee's first name, M.I., last name
          </span>
          <p className="font-bold text-[9px] uppercase">
            {formData.firstName || "Jordan"}{" "}
            {formData.middleInitial ? `${formData.middleInitial}.` : ""}{" "}
            {formData.lastName || "Miller"}
          </p>
        </div>
      </div>

      <div className="col-span-7">
        <div className="grid grid-cols-2 border-b border-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              1. Wages, tips, other comp.
            </span>
            <span className="font-semibold block text-right">
              ${formData.box1Wages || "0.00"}
            </span>
          </div>
          <div className="p-1 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              2. Federal income tax
            </span>
            <span className="font-semibold block text-right">
              ${formData.box2FederalTax || "0.00"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              3. Social security wages
            </span>
            <span className="font-semibold block text-right">
              ${formData.box3SocialSecurityWages || "0.00"}
            </span>
          </div>
          <div className="p-1 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              4. Social security tax
            </span>
            <span className="font-semibold block text-right">
              ${formData.box4SocialSecurityTax || "0.00"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              5. Medicare wages
            </span>
            <span className="font-semibold block text-right">
              ${formData.box5MedicareWages || "0.00"}
            </span>
          </div>
          <div className="p-1 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              6. Medicare tax withheld
            </span>
            <span className="font-semibold block text-right">
              ${formData.box6MedicareTax || "0.00"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-slate-400 text-[7.5px] min-h-[26px]">
          <div className="p-1 border-r border-slate-400 flex flex-col">
            <span className="text-[7px] text-slate-500 block">
              7. Social security tips
            </span>
            <span className="font-semibold block text-right mt-auto">
              {formData.box7SocialSecurityTips
                ? `$${formData.box7SocialSecurityTips}`
                : ""}
            </span>
          </div>
          <div className="p-1 flex flex-col">
            <span className="text-[7px] text-slate-500 block">
              8. Allocated tips
            </span>
            <span className="font-semibold block text-right mt-auto">
              {formData.box8AllocatedTips
                ? `$${formData.box8AllocatedTips}`
                : ""}
            </span>
          </div>
        </div>

        <div className="px-1 leading-none h-[8px]">
          <span className="text-[6.5px] text-slate-400">9.</span>
        </div>
      </div>
    </div>

    {/* Box f | 10+11 top row, 12 below — compact so f bottom stays tight */}
    <div className="grid grid-cols-12 border-b border-slate-400 items-stretch">
      <div className="col-span-5 px-1 py-0.5 border-r border-slate-400 leading-none">
        <span className="text-[7.5px] text-slate-500 block">
          f. Employee's address and ZIP code
        </span>
        <p className="text-[8px] leading-tight mt-px">
          {formData.employeeAddress || "88 Pine Ave"}
        </p>
        <p className="text-[8px] leading-tight">
          {formData.employeeCity || "Oakland"},{" "}
          {formData.employeeState || "CA"} {formData.employeeZip || "94607"}
        </p>
      </div>

      <div className="col-span-7 flex flex-col text-[7.5px]">
        <div className="grid grid-cols-2 border-b border-slate-400 min-h-[20px]">
          <div className="px-1 py-px border-r border-slate-400 flex flex-col justify-between gap-px">
            <span className="text-[7px] text-slate-500 block leading-none">
              10. Dependent care
            </span>
            <span className="font-semibold block text-right leading-none">
              {formData.box10DependentCare
                ? `$${formData.box10DependentCare}`
                : ""}
            </span>
          </div>
          <div className="px-1 py-px flex flex-col justify-between gap-px">
            <span className="text-[7px] text-slate-500 block leading-none">
              11. Nonqualified plans
            </span>
            <span className="font-semibold block text-right leading-none">
              {formData.box11NonqualifiedPlans
                ? `$${formData.box11NonqualifiedPlans}`
                : ""}
            </span>
          </div>
        </div>
        <div className="px-1 py-px flex flex-col justify-between min-h-[20px] gap-px">
          <span className="text-[7px] text-slate-500 leading-none">
            12. {formData.box12Code || "DD"}
          </span>
          <span className="font-semibold block text-right leading-none">
            ${formData.box12Amount || "0.00"}
          </span>
        </div>
      </div>
    </div>

    {/* Full-width Box 13 + 14 — compact height, little space above/below content */}
    <div className="grid grid-cols-[1fr_auto] border-b border-slate-400">
      <div className="relative px-1 py-1 flex items-center border-r border-slate-400 min-h-[28px]">
        <span className="absolute left-1 top-0.5 text-[7px] text-slate-500 leading-none">
          13.
        </span>
        <div className="grid grid-cols-3 w-full gap-x-2 pl-4 pr-1">
          {BOX13_ITEMS.map((item) => (
            <div
              key={item.field}
              className="flex items-center justify-center gap-1 min-w-0"
            >
              <span
                className="inline-flex h-2 w-2 shrink-0 items-center justify-center border border-slate-700 text-[6px] leading-none text-slate-900"
                aria-hidden="true"
              >
                {formData[item.field] ? "✓" : ""}
              </span>
              <span className="text-[6.5px] text-slate-700 leading-none whitespace-nowrap">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-1 py-1 min-w-[80px] min-h-[28px]">
        <span className="text-[7px] text-slate-500 leading-none block">
          14 – Other
        </span>
        {(formData.box14Description || formData.box14Amount) && (
          <p className="text-[7px] text-slate-800 leading-tight mt-0.5 break-words">
            {formData.box14Description}
            {formData.box14Description && formData.box14Amount ? " " : ""}
            {formData.box14Amount ? `$${formData.box14Amount}` : ""}
          </p>
        )}
      </div>
    </div>

    {/* Bottom State Taxes (Boxes 15 - 20) */}
    <div className="grid grid-cols-6 border-b border-slate-400 text-[7.5px] min-h-[28px]">
      <div className="border-r border-slate-400 p-0.5 flex flex-col">
        <span className="text-[6.5px] text-slate-500 block">
          15. State / Employer's ID
        </span>
        <span className="font-semibold mt-auto">
          {formData.box15State || "CA"} {formData.box15StateId || ""}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5 flex flex-col">
        <span className="text-[6.5px] text-slate-500 block">
          16. State wages
        </span>
        <span className="font-semibold block text-right mt-auto">
          ${formData.box16StateWages || "0.00"}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5 flex flex-col">
        <span className="text-[6.5px] text-slate-500 block">
          17. State income tax
        </span>
        <span className="font-semibold block text-right mt-auto">
          ${formData.box17StateTax || "0.00"}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5 flex flex-col">
        <span className="text-[6.5px] text-slate-500 block">
          18. Local wages
        </span>
        <span className="font-semibold block text-right mt-auto">
          {formData.box18LocalWages ? `$${formData.box18LocalWages}` : ""}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5 flex flex-col">
        <span className="text-[6.5px] text-slate-500 block">
          19. Local income tax
        </span>
        <span className="font-semibold block text-right mt-auto">
          {formData.box19LocalTax ? `$${formData.box19LocalTax}` : ""}
        </span>
      </div>
      <div className="p-0.5 flex flex-col">
        <span className="text-[6.5px] text-slate-500 block">
          20. Locality name
        </span>
        <span className="font-semibold block text-right mt-auto break-words">
          {formData.box20Locality || ""}
        </span>
      </div>
    </div>

    {/* Official IRS Title Footer */}
    <div className="pt-2 flex items-center justify-between gap-2 leading-none">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-black text-slate-900 leading-none">
          W-2
        </span>
        <span className="text-[8px] text-slate-600 font-medium leading-none">
          Wage and Tax Statement
        </span>
        <span className="text-[11px] font-black text-slate-900 leading-none">
          {formData.taxYear || 2025}
        </span>
      </div>
      <span className="text-[7px] text-slate-500 font-normal leading-none">
        Department of the Treasury—Internal Revenue Service
      </span>
    </div>
  </div>
);

export default W2FormDocument;
