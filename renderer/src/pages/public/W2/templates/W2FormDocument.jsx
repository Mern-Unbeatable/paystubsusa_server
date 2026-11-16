import React from "react";

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
          a Employee's social security number
        </span>
        <strong className="text-[9.5px] tracking-wider">
          {formData.ssn || "000-00-0000"}
        </strong>
      </div>
      <div className="col-span-3 p-1 text-right text-[7.5px] text-slate-500 font-medium">
        OMB No. 1545-0008
      </div>
    </div>

    {/* Middle Rows Grid */}
    <div className="grid grid-cols-12 border-b border-slate-400">
      {/* Left Column (Boxes b, c, d, e, f) */}
      <div className="col-span-6 border-r border-slate-400">
        {/* Box b: EIN */}
        <div className="p-1 border-b border-slate-400 min-h-[28px]">
          <span className="text-[7.5px] text-slate-500 block">
            b Employer identification number (EIN)
          </span>
          <span className="font-semibold">{formData.ein || "12-3456789"}</span>
        </div>

        {/* Box c: Employer Name & Address */}
        <div className="p-1 border-b border-slate-400 min-h-[48px]">
          <span className="text-[7.5px] text-slate-500 block">
            c Employer's name, address, and ZIP code
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

        {/* Box d: Control number */}
        <div className="p-1 border-b border-slate-400 min-h-[22px]">
          <span className="text-[7.5px] text-slate-500 block">
            d Control number
          </span>
          <span className="text-[8px]">{formData.controlNumber || ""}</span>
        </div>

        {/* Box e: Employee Name */}
        <div className="p-1 border-b border-slate-400 min-h-[28px]">
          <span className="text-[7.5px] text-slate-500 block">
            e Employee's first name, M.I., last name
          </span>
          <p className="font-bold text-[9px] uppercase">
            {formData.firstName || "Jordan"}{" "}
            {formData.middleInitial ? `${formData.middleInitial}.` : ""}{" "}
            {formData.lastName || "Miller"}
          </p>
        </div>

        {/* Box f: Employee Address */}
        <div className="p-1 min-h-[36px]">
          <span className="text-[7.5px] text-slate-500 block">
            f Employee's address and ZIP code
          </span>
          <p className="text-[8px]">
            {formData.employeeAddress || "88 Pine Ave"}
          </p>
          <p className="text-[8px]">
            {formData.employeeCity || "Oakland"},{" "}
            {formData.employeeState || "CA"} {formData.employeeZip || "94607"}
          </p>
        </div>
      </div>

      {/* Right Column (Numbered Boxes 1 to 14) */}
      <div className="col-span-6">
        {/* Row 1 & 2 */}
        <div className="grid grid-cols-2 border-b border-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              1 Wages, tips, other comp.
            </span>
            <span className="font-semibold block text-right">
              ${formData.box1Wages || "0.00"}
            </span>
          </div>
          <div className="p-1 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              2 Federal income tax
            </span>
            <span className="font-semibold block text-right">
              ${formData.box2FederalTax || "0.00"}
            </span>
          </div>
        </div>

        {/* Row 3 & 4 */}
        <div className="grid grid-cols-2 border-b border-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              3 Social security wages
            </span>
            <span className="font-semibold block text-right">
              ${formData.box3SocialSecurityWages || "0.00"}
            </span>
          </div>
          <div className="p-1 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              4 Social security tax
            </span>
            <span className="font-semibold block text-right">
              ${formData.box4SocialSecurityTax || "0.00"}
            </span>
          </div>
        </div>

        {/* Row 5 & 6 */}
        <div className="grid grid-cols-2 border-b border-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              5 Medicare wages
            </span>
            <span className="font-semibold block text-right">
              ${formData.box5MedicareWages || "0.00"}
            </span>
          </div>
          <div className="p-1 min-h-[26px]">
            <span className="text-[7px] text-slate-500 block">
              6 Medicare tax withheld
            </span>
            <span className="font-semibold block text-right">
              ${formData.box6MedicareTax || "0.00"}
            </span>
          </div>
        </div>

        {/* Row 7 & 8 */}
        <div className="grid grid-cols-2 border-b border-slate-400 text-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[22px]">
            <span className="text-[7px] block">7 Social security tips</span>
            <span className="text-[7.5px] text-slate-700 block text-right">
              {formData.box7SocialSecurityTips
                ? `$${formData.box7SocialSecurityTips}`
                : ""}
            </span>
          </div>
          <div className="p-1 min-h-[22px]">
            <span className="text-[7px] block">8 Allocated tips</span>
            <span className="text-[7.5px] text-slate-700 block text-right">
              {formData.box8AllocatedTips
                ? `$${formData.box8AllocatedTips}`
                : ""}
            </span>
          </div>
        </div>

        {/* Row 10 & 11 */}
        <div className="grid grid-cols-2 border-b border-slate-400 text-slate-400">
          <div className="p-1 border-r border-slate-400 min-h-[22px]">
            <span className="text-[7px] block">10 Dependent care</span>
            <span className="text-[7.5px] text-slate-700 block text-right">
              {formData.box10DependentCare
                ? `$${formData.box10DependentCare}`
                : ""}
            </span>
          </div>
          <div className="p-1 min-h-[22px]">
            <span className="text-[7px] block">11 Nonqualified plans</span>
            <span className="text-[7.5px] text-slate-700 block text-right">
              {formData.box11NonqualifiedPlans
                ? `$${formData.box11NonqualifiedPlans}`
                : ""}
            </span>
          </div>
        </div>

        {/* Box 12 */}
        <div className="p-1 border-b border-slate-400 flex items-center justify-between text-[7.5px]">
          <span className="text-[7px] text-slate-500">
            12a {formData.box12Code || "DD"}
          </span>
          <span className="font-semibold">
            ${formData.box12Amount || "0.00"}
          </span>
        </div>

        {/* Box 13 */}
        <div className="p-1 flex items-center justify-between text-[7.5px] text-slate-600">
          <div className="flex items-center gap-1">
            <span className="text-[7px] text-slate-400">13</span>
            <span>Statutory {formData.box13StatutoryEmployee ? "☑" : "□"}</span>
            <span>Retirement □</span>
          </div>
          <div className="text-[7px] text-slate-400">14 Other</div>
        </div>
      </div>
    </div>

    {/* Bottom State Taxes (Boxes 15 - 20) */}
    <div className="grid grid-cols-6 border-b border-slate-400 text-[7.5px] min-h-[24px]">
      <div className="border-r border-slate-400 p-0.5">
        <span className="text-[6.5px] text-slate-500 block">
          15 State / Employer's ID
        </span>
        <span className="font-semibold">
          {formData.box15State || "CA"} {formData.box15StateId || ""}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5">
        <span className="text-[6.5px] text-slate-500 block">
          16 State wages
        </span>
        <span className="font-semibold block text-right">
          ${formData.box16StateWages || "0.00"}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5">
        <span className="text-[6.5px] text-slate-500 block">
          17 State income tax
        </span>
        <span className="font-semibold block text-right">
          ${formData.box17StateTax || "0.00"}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5">
        <span className="text-[6.5px] text-slate-500 block">
          18 Local wages
        </span>
        <span className="text-slate-700 block text-right">
          {formData.box18LocalWages ? `$${formData.box18LocalWages}` : "—"}
        </span>
      </div>
      <div className="border-r border-slate-400 p-0.5">
        <span className="text-[6.5px] text-slate-500 block">
          19 Local income tax
        </span>
        <span className="text-slate-700 block text-right">
          {formData.box19LocalTax ? `$${formData.box19LocalTax}` : "—"}
        </span>
      </div>
      <div className="p-0.5">
        <span className="text-[6.5px] text-slate-500 block">
          20 Locality name
        </span>
        <span className="text-slate-700 block text-right break-words">
          {formData.box20Locality || "—"}
        </span>
      </div>
    </div>

    {/* Official IRS Title Footer */}
    <div className="pt-2 flex items-center justify-between font-bold text-[8.5px]">
      <div className="flex items-baseline gap-1">
        <span className="text-[11px] font-black text-slate-900">W-2</span>
        <span className="text-[8px] text-slate-600 font-medium">
          Wage and Tax Statement
        </span>
        <span className="text-[11px] font-black text-slate-900 ml-1">2025</span>
      </div>
      <span className="text-[7px] text-slate-500 font-normal">
        Department of the Treasury—Internal Revenue Service
      </span>
    </div>
  </div>
);

export default W2FormDocument;
