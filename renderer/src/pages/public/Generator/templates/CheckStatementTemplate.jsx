import CompanyLogo from "./CompanyLogo";

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;

const HEADER_BLUE = "#c9ddf7";
const EARNINGS_HEADER = "#dde6f2";
const TOTAL_ROW = "#eef0fb";
const STRIPE_GRAY = "#dedede";
const CELL_BORDER = "1px solid #d3dae4";
const ROW_HEIGHT = 24;

const at = (left, top, extra) => ({ position: "absolute", left, top, ...extra });

// Decorative security pattern for the check face, drawn as vector lines.
const CheckPattern = () => (
  <svg
    width="776"
    height="288"
    viewBox="0 0 776 288"
    style={at(0, 0)}
    aria-hidden="true"
  >
    <g fill="none" stroke="#d6dcbc" strokeWidth="1.4" opacity="0.9">
      {[-260, -140, -20, 100, 220, 340, 460, 580, 700].map((x) => (
        <path key={`a${x}`} d={`M${x} 300 Q ${x + 160} 40 ${x + 420} -20`} />
      ))}
      {[-200, -80, 40, 160, 280, 400, 520, 640, 760].map((x) => (
        <path key={`b${x}`} d={`M${x + 420} 300 Q ${x + 260} 40 ${x} -20`} />
      ))}
      <ellipse cx="388" cy="330" rx="420" ry="150" />
      <ellipse cx="388" cy="-40" rx="460" ry="130" />
    </g>
    <g fill="#e4e3c6" opacity="0.6">
      <path d="M170 40c40-18 95-14 120 8 18 16 6 40-18 50-30 12-34 34-62 40-26 6-44-16-52-40-8-26-12-46 12-58z" />
      <path d="M300 150c22-8 48 2 56 24 8 22-4 52-20 70-12 14-30 10-36-8-8-22-16-36-14-56 2-16 4-24 14-30z" />
      <path d="M420 34c50-20 130-22 190-6 50 14 70 44 48 66-18 18-58 10-86 26-28 16-40 44-74 40-36-4-44-36-76-48-30-12-46-52-2-78z" />
      <path d="M610 170c22-10 52-6 66 10 14 18 0 40-24 44-28 4-58-4-60-24-2-12 6-24 18-30z" />
    </g>
  </svg>
);

const Table = ({ columns, rows, header = HEADER_BLUE, striped = false, total }) => (
  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
    <colgroup>
      {columns.map((col) => (
        <col key={col.key} style={{ width: col.width }} />
      ))}
    </colgroup>
    <thead>
      <tr style={{ background: header, height: ROW_HEIGHT + 1 }}>
        {columns.map((col) => (
          <th key={col.key} style={{ textAlign: "left", fontWeight: 700, padding: "0 6px", whiteSpace: "nowrap" }}>
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row, index) => (
        <tr
          key={index}
          style={{
            height: ROW_HEIGHT,
            background: striped && index % 2 === 1 ? STRIPE_GRAY : "#ffffff",
            borderTop: CELL_BORDER,
          }}
        >
          {columns.map((col) => (
            <td key={col.key} style={{ padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden" }}>
              {row[col.key]}
            </td>
          ))}
        </tr>
      ))}
      {total && (
        <tr style={{ height: ROW_HEIGHT, background: TOTAL_ROW, fontWeight: 700, borderTop: CELL_BORDER }}>
          {columns.map((col) => (
            <td key={col.key} style={{ padding: "0 6px", whiteSpace: "nowrap" }}>
              {total[col.key]}
            </td>
          ))}
        </tr>
      )}
    </tbody>
  </table>
);

const Boxed = ({ children, style }) => (
  <div style={{ border: CELL_BORDER, borderTop: "none", background: "#ffffff", ...style }}>{children}</div>
);

const SectionTitle = ({ children }) => (
  <div style={{ background: HEADER_BLUE, height: ROW_HEIGHT + 1, lineHeight: `${ROW_HEIGHT + 1}px`, padding: "0 6px", fontWeight: 700 }}>
    {children}
  </div>
);

const DottedRule = ({ left, width }) => (
  <div style={at(left, 356, { width, borderTop: "1.5px dotted #8a8a8a" })}>
    <span style={at(left === 20 ? 0 : width - 1, -4, { height: 7, borderLeft: "1.5px dotted #8a8a8a" })} />
  </div>
);

const LINE_ITEM_COLUMNS = [
  { key: "label", label: "Taxes", width: 278 },
  { key: "amount", label: "Amount", width: 92 },
  { key: "ytd", label: "YTD", width: 93 },
];

/** Template 10 — voided check on top with a tabular "Statement of Earnings". */
const CheckStatementTemplate = ({ data }) => {
  const { company, employee, period, earnings, taxes, deductions, totals, reference } = data;
  const toRows = (items) => items.map((item) => ({ label: item.label, amount: item.amountText, ytd: item.ytdText }));

  return (
    <div
      style={{
        position: "relative",
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        background: "#ffffff",
        color: "#1a1a1a",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 11.5,
        lineHeight: 1.35,
        overflow: "hidden",
      }}
    >
      {/* Check */}
      <div style={at(20, 20, { width: 776, borderRadius: 9, overflow: "hidden" })}>
        <div
          style={{
            height: 22,
            lineHeight: "22px",
            background: "#6b9c77",
            color: "#ffffff",
            fontSize: 9.5,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: 0.2,
          }}
        >
          THIS CHECK IS NO LONGER VALID AND CANNOT BE PROCESSED
        </div>
        <div style={{ position: "relative", height: 288, background: "#f2f0dc" }}>
          <CheckPattern />

          <div style={at(company.logo ? 18 : 22, 14, { display: "flex", alignItems: "center", gap: 9 })}>
            {company.logo && (
              <>
                <CompanyLogo src={company.logo} boxWidth={82} boxHeight={66} shrink />
                <div style={{ alignSelf: "stretch", width: 1, background: "#8f8f7a" }} />
              </>
            )}
            <div style={{ width: 420 }}>
              <div style={{ fontSize: 17.5, fontWeight: 700, lineHeight: "22px" }}>{company.name}</div>
              <div style={{ fontSize: 12, lineHeight: "16.5px" }}>
                <div>{company.address}</div>
                <div>{company.cityLine}</div>
                <div>EIN: {company.ein}</div>
                {company.phone && <div>{company.phone}</div>}
              </div>
            </div>
          </div>

          <div style={at(456, 13, { width: 300, textAlign: "right", fontSize: 11.5, lineHeight: "16px" })}>
            <div style={{ fontWeight: 700 }}>Check No: {reference.checkNumber}</div>
            <div>Date: {period.payDate}</div>
          </div>

          <div style={at(19, 106, { width: 589, fontSize: 12.5, lineHeight: "18px", borderBottom: "1px solid #3a3a3a", whiteSpace: "nowrap", overflow: "hidden" })}>
            PAY TO THE ORDER OF:&nbsp; {employee.name}
          </div>
          <div style={at(609, 106, { fontSize: 12.5, lineHeight: "18px" })}>$</div>
          <div style={at(621, 106, { width: 135, fontSize: 12.5, lineHeight: "18px", borderBottom: "1px solid #3a3a3a" })}>
            {totals.netNumeric}
          </div>
          <div style={at(19, 125, { width: 589, fontSize: 12.5, lineHeight: "18px", borderBottom: "1px solid #3a3a3a", whiteSpace: "nowrap", overflow: "hidden" })}>
            {totals.netWords}
          </div>

          <div style={at(19, 166, { fontSize: 9 })}>NON-NEGOTIABLE</div>

          <div
            style={at(491, 196, {
              width: 265,
              textAlign: "center",
              fontFamily: "'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', cursive",
              fontSize: 23,
              lineHeight: "36px",
              whiteSpace: "nowrap",
              overflow: "hidden",
            })}
          >
            {company.name}
          </div>
          <div style={at(491, 234, { width: 265, borderTop: "1px solid #3a3a3a", textAlign: "center", fontSize: 9, paddingTop: 1 })}>
            AUTHORIZED SIGNATURE
          </div>
        </div>
      </div>

      {/* Statement heading */}
      <DottedRule left={20} width={272} />
      <div style={at(292, 345, { width: 232, textAlign: "center", fontSize: 14, fontWeight: 700 })}>
        STATEMENT OF EARNINGS
      </div>
      <DottedRule left={524} width={272} />

      {/* Summary row */}
      <div style={at(20, 379, { width: 776 })}>
        <Table
          columns={[
            { key: "id", label: "Employee ID", width: 151 },
            { key: "payDate", label: "Payment Date", width: 166 },
            { key: "start", label: "Period Start", width: 150 },
            { key: "end", label: "Period End", width: 141 },
            { key: "check", label: "Check Number", width: 168 },
          ]}
          rows={[
            { id: employee.id, payDate: period.payDate, start: period.start, end: period.end, check: reference.checkNumber },
          ]}
        />
        <div style={{ height: 0, borderBottom: CELL_BORDER }} />
      </div>

      {/* Left column */}
      <div style={at(21, 441, { width: 463 })}>
        <div style={{ border: CELL_BORDER, borderTop: "none" }}>
          <Table
            header={EARNINGS_HEADER}
            columns={[
              { key: "label", label: "Earnings", width: 122 },
              { key: "rate", label: "Rate", width: 78 },
              { key: "hours", label: "Hours", width: 78 },
              { key: "amount", label: "Amount", width: 92 },
              { key: "ytd", label: "YTD", width: 93 },
            ]}
            rows={earnings.map((row) => ({ label: row.label, rate: row.rate, hours: row.hours, amount: row.amountText, ytd: row.ytdText }))}
            total={{ label: "Total", amount: totals.gross, ytd: totals.grossYtd }}
          />
        </div>

        <div style={{ marginTop: 30, border: CELL_BORDER, borderTop: "none" }}>
          <Table
            striped
            columns={LINE_ITEM_COLUMNS}
            rows={toRows(taxes)}
            total={{ label: "Total", amount: totals.taxes, ytd: totals.taxesYtd }}
          />
        </div>
        {deductions.length > 0 && (
          <div style={{ marginTop: 30, border: CELL_BORDER, borderTop: "none" }}>
            <Table
              striped
              columns={LINE_ITEM_COLUMNS.map((col) => (col.key === "label" ? { ...col, label: "Deductions" } : col))}
              rows={toRows(deductions)}
              total={{ label: "Total", amount: totals.deductions, ytd: totals.deductionsYtd }}
            />
          </div>
        )}
      </div>

      {/* Right column: a long address wraps and pushes the sections below it down */}
      <div style={at(487, 441, { width: 306, height: 547, display: "flex", flexDirection: "column" })}>
        <SectionTitle>Employee Address</SectionTitle>
        <Boxed style={{ minHeight: ROW_HEIGHT, lineHeight: "16px", padding: "4px 6px 3px", overflowWrap: "anywhere" }}>
          {[employee.address, employee.cityLine].filter(Boolean).join(", ")}
        </Boxed>

        <div style={{ height: 32, flexShrink: 0 }} />
        <SectionTitle>Employee Payment Information</SectionTitle>
        <Boxed>
          {[
            ["Employee Net pay", totals.net],
            ["Distribution Type", data.distributionType],
            ["Pay Frequency", period.frequency],
          ].map(([label, value], index) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                height: ROW_HEIGHT,
                lineHeight: `${ROW_HEIGHT}px`,
                padding: "0 18px 0 6px",
                background: index === 1 ? "#e6e6e6" : "#ffffff",
                borderTop: index ? CELL_BORDER : "none",
              }}
            >
              <span style={{ fontWeight: 700 }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </Boxed>

        <div style={{ height: 33, flexShrink: 0 }} />
        <SectionTitle>Important Notes</SectionTitle>
        <div style={{ marginTop: 7, flex: 1, minHeight: 0, background: "#dce7dd" }} />
      </div>
    </div>
  );
};

export default CheckStatementTemplate;
