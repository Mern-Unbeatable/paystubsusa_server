import CompanyLogo from "./CompanyLogo";
import DirectDepositSlip from "./DirectDepositSlip";
import { shouldRenderDirectDepositSlip } from "./shouldRenderDirectDepositSlip";

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;

const HEADER_BLUE = "#c9ddf7";
const EARNINGS_HEADER = "#dde6f2";
const TOTAL_ROW = "#eef0fb";
const STRIPE_GRAY = "#dedede";
const CELL_BORDER = "1px solid #d3dae4";
const CHECK_BANNER = "#6a9a76";
const CHECK_FACE = "#f1eed8";
const ROW_HEIGHT = 24;

const at = (left, top, extra) => ({
  position: "absolute",
  left,
  top,
  ...extra,
});

/** Dense guilloche / security-paper line draw for the check face. */
const wavePath = (y0, amp, freq, phase, width = 776) => {
  const steps = 48;
  let d = `M0 ${y0}`;
  for (let i = 1; i <= steps; i += 1) {
    const x = (i / steps) * width;
    const y = y0 + Math.sin((i / steps) * Math.PI * freq + phase) * amp;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
};

const CheckPattern = () => {
  const waves = [];
  // Packed horizontal waves (~1.15px spacing across the face).
  for (let i = 0; i < 240; i += 1) {
    waves.push({
      key: `w${i}`,
      d: wavePath(0.5 + i * 1.15, 4.5 + (i % 6), 8 + (i % 5), i * 0.28),
    });
  }
  // Phase-shifted overlay for cross-hatch density.
  for (let i = 0; i < 180; i += 1) {
    waves.push({
      key: `w2-${i}`,
      d: wavePath(1 + i * 1.55, 6 + (i % 5), 5.5 + (i % 4), i * 0.62 + 0.9),
    });
  }
  // Fine shallow fill.
  for (let i = 0; i < 140; i += 1) {
    waves.push({
      key: `w3-${i}`,
      d: wavePath(0.25 + i * 2, 3.2 + (i % 3), 9 + (i % 4), i * 0.95 + 1.4),
    });
  }
  const arcs = [];
  for (let i = 0; i < 70; i += 1) {
    arcs.push({ key: `al${i}`, cx: 70, cy: 160, r: 10 + i * 4.5 });
    arcs.push({ key: `ar${i}`, cx: 710, cy: 110, r: 8 + i * 5 });
    arcs.push({ key: `ac${i}`, cx: 390, cy: 300, r: 18 + i * 5.5 });
    arcs.push({ key: `am${i}`, cx: 250, cy: -20, r: 14 + i * 5.5 });
    arcs.push({ key: `abl${i}`, cx: 40, cy: 40, r: 8 + i * 5 });
    arcs.push({ key: `abr${i}`, cx: 740, cy: 240, r: 10 + i * 5 });
    arcs.push({ key: `amid${i}`, cx: 480, cy: 80, r: 12 + i * 5 });
  }

  return (
    <svg
      width="776"
      height="268"
      viewBox="0 0 776 268"
      style={at(0, 0)}
      aria-hidden="true"
    >
      <rect width="776" height="268" fill="#f4f1e0" />
      <g fill="none" stroke="#d8d9d0" strokeWidth="0.4" opacity="0.95">
        {waves.map((w) => (
          <path key={w.key} d={w.d} />
        ))}
      </g>
      <g fill="none" stroke="#d4d5cc" strokeWidth="0.4" opacity="0.6">
        {arcs.map((a) => (
          <circle key={a.key} cx={a.cx} cy={a.cy} r={a.r} />
        ))}
      </g>
      <g fill="none" stroke="#d6d7ce" strokeWidth="0.4" opacity="0.5">
        {Array.from({ length: 56 }, (_, i) => -200 + i * 20).map((x) => (
          <path
            key={`d1-${x}`}
            d={`M${x} 280 Q ${x + 100} 36 ${x + 260} -30`}
          />
        ))}
        {Array.from({ length: 56 }, (_, i) => -170 + i * 20).map((x) => (
          <path
            key={`d2-${x}`}
            d={`M${x + 260} 280 Q ${x + 100} 36 ${x} -30`}
          />
        ))}
      </g>
      <text
        x="520"
        y="170"
        fill="#c4c5bc"
        fillOpacity="0.28"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="92"
        fontWeight="700"
        transform="rotate(-18 520 170)"
        style={{ letterSpacing: "6px" }}
      >
        VOID
      </text>
    </svg>
  );
};

const Table = ({
  columns,
  rows,
  header = HEADER_BLUE,
  striped = false,
  total,
}) => (
  <table
    style={{
      width: "100%",
      borderCollapse: "collapse",
      tableLayout: "fixed",
    }}
  >
    <colgroup>
      {columns.map((col) => (
        <col key={col.key} style={{ width: col.width }} />
      ))}
    </colgroup>
    <thead>
      <tr style={{ background: header, height: ROW_HEIGHT + 1 }}>
        {columns.map((col) => (
          <th
            key={col.key}
            style={{
              textAlign: "left",
              fontWeight: 700,
              padding: "0 6px",
              whiteSpace: "nowrap",
            }}
          >
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
            <td
              key={col.key}
              style={{
                padding: "0 6px",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {row[col.key]}
            </td>
          ))}
        </tr>
      ))}
      {total && (
        <tr
          style={{
            height: ROW_HEIGHT,
            background: TOTAL_ROW,
            fontWeight: 700,
            borderTop: CELL_BORDER,
          }}
        >
          {columns.map((col) => (
            <td
              key={col.key}
              style={{ padding: "0 6px", whiteSpace: "nowrap" }}
            >
              {total[col.key]}
            </td>
          ))}
        </tr>
      )}
    </tbody>
  </table>
);

const Boxed = ({ children, style }) => (
  <div
    style={{
      border: CELL_BORDER,
      borderTop: "none",
      background: "#ffffff",
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionTitle = ({ children }) => (
  <div
    style={{
      background: HEADER_BLUE,
      height: ROW_HEIGHT + 1,
      lineHeight: `${ROW_HEIGHT + 1}px`,
      padding: "0 6px",
      fontWeight: 700,
    }}
  >
    {children}
  </div>
);

const DottedRule = ({ flex = false, width }) => (
  <div
    style={{
      ...(flex
        ? { flex: 1, minWidth: 0 }
        : { width, position: "relative" }),
      height: 0,
      borderTop: "1.5px dotted #8a8a8a",
    }}
  />
);

const LINE_ITEM_COLUMNS = [
  { key: "label", label: "Taxes", width: 278 },
  { key: "amount", label: "Amount", width: 92 },
  { key: "ytd", label: "YTD", width: 93 },
];

/** Template 10 — voided check on top with a tabular "Statement of Earnings". */
const CheckStatementTemplate = ({ data }) => {
  const {
    company,
    employee,
    period,
    earnings,
    taxes,
    deductions,
    totals,
    reference,
  } = data;
  // Paid DD slip replaces the voided check face (one stub only).
  const showDdSlip = shouldRenderDirectDepositSlip(data.directDeposit);
  const toRows = (items) =>
    items.map((item) => ({
      label: item.label,
      amount: item.amountText,
      ytd: item.ytdText,
    }));

  const amountDisplay = String(totals.netNumeric || totals.net || "")
    .replace(/^\$\s*/, "")
    .trim();

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
      {showDdSlip ? (
        <div style={at(20, 16, { width: 776 })}>
          <DirectDepositSlip data={data} embedded />
        </div>
      ) : null}

      {/* Check — hidden when a paid DD slip is shown instead */}
      <div
        style={at(20, 16, {
          width: 776,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #c9cbb8",
          display: showDdSlip ? "none" : undefined,
        })}
      >
        <div
          style={{
            height: 26,
            lineHeight: "26px",
            background: CHECK_BANNER,
            color: "#ffffff",
            fontSize: 11,
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          THIS CHECK IS NO LONGER VALID AND CANNOT BE PROCESSED
        </div>

        <div
          style={{
            position: "relative",
            height: 268,
            background: CHECK_FACE,
          }}
        >
          <CheckPattern />

          {/* Logo stacked above address (matches reference header) */}
          <div style={at(18, 12, { width: 360 })}>
            {company.logo ? (
              <div style={{ marginBottom: 6 }}>
                <CompanyLogo
                  src={company.logo}
                  boxWidth={92}
                  boxHeight={52}
                  shrink
                />
              </div>
            ) : null}
            <div
              style={{
                fontSize: 11.5,
                lineHeight: "15px",
                textTransform: "uppercase",
                letterSpacing: 0.2,
              }}
            >
              <div>{company.address || "COMPANY ADDRESS"}</div>
              <div>{company.cityLine || "CITY, STATE ZIP"}</div>
            </div>
          </div>

          {/* Check meta */}
          <div
            style={at(500, 14, {
              width: 256,
              textAlign: "right",
              fontSize: 12.5,
              lineHeight: "18px",
            })}
          >
            <div>
              <span style={{ fontWeight: 700 }}>Check No:</span>{" "}
              {reference.checkNumber}
            </div>
            <div>
              <span style={{ fontWeight: 700 }}>Date:</span> {period.payDate}
            </div>
          </div>

          {/* Payee + amount on matching underline lines */}
          <div
            style={at(18, 112, {
              width: 520,
              fontSize: 12.5,
              lineHeight: "20px",
              borderBottom: "1.5px solid #1a1a1a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              paddingBottom: 3,
            })}
          >
            <span style={{ fontWeight: 700 }}>PAY TO THE ORDER OF:</span>
            &nbsp; {employee.name}
          </div>
          <div
            style={at(560, 112, {
              width: 196,
              fontSize: 13,
              fontWeight: 700,
              lineHeight: "20px",
              borderBottom: "1.5px solid #1a1a1a",
              paddingBottom: 3,
              letterSpacing: 0.2,
              whiteSpace: "nowrap",
            })}
          >
            $&nbsp;{amountDisplay}
          </div>

          {/* Legal amount */}
          <div
            style={at(18, 146, {
              width: 738,
              fontSize: 12,
              lineHeight: "20px",
              borderBottom: "1px solid #2f2f2f",
              whiteSpace: "nowrap",
              overflow: "hidden",
              paddingBottom: 2,
              textTransform: "uppercase",
            })}
          >
            {totals.netWords}
          </div>

          <div
            style={at(18, 190, {
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.4,
            })}
          >
            NON-NEGOTIABLE
          </div>

          <div
            className="pinyon-script-regular"
            style={at(470, 192, {
              width: 286,
              textAlign: "center",
              fontSize: 22,
              lineHeight: "34px",
              whiteSpace: "nowrap",
              overflow: "hidden",
            })}
          >
            <p>{company.checkSigner}</p>
          </div>
          <div
            style={at(470, 228, {
              width: 286,
              borderTop: "1px solid #2f2f2f",
              textAlign: "center",
              fontSize: 9,
              paddingTop: 2,
              letterSpacing: 0.3,
            })}
          >
            AUTHORIZED SIGNATURE
          </div>
        </div>
      </div>

      {/* Gap between check and statement */}
      <div style={at(20, 318, { width: 776, height: 10 })} />

      {/* Statement heading — lines vertically centered with title */}
      <div
        style={at(20, 328, {
          width: 776,
          height: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
        })}
      >
        <DottedRule flex />
        <div
          style={{
            flex: "0 0 auto",
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            lineHeight: "20px",
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
          }}
        >
          STATEMENT OF EARNINGS
        </div>
        <DottedRule flex />
      </div>

      {/* Summary row */}
      <div style={at(20, 360, { width: 776 })}>
        <Table
          columns={[
            { key: "id", label: "Employee ID", width: 151 },
            { key: "payDate", label: "Payment Date", width: 166 },
            { key: "start", label: "Period Start", width: 150 },
            { key: "end", label: "Period End", width: 141 },
            { key: "check", label: "Check Number", width: 168 },
          ]}
          rows={[
            {
              id: employee.id,
              payDate: period.payDate,
              start: period.start,
              end: period.end,
              check: reference.checkNumber,
            },
          ]}
        />
        <div style={{ height: 0, borderBottom: CELL_BORDER }} />
      </div>

      {/* Left column */}
      <div style={at(20, 420, { width: 464 })}>
        <div style={{ border: CELL_BORDER, borderTop: "none" }}>
          <Table
            header={EARNINGS_HEADER}
            columns={[
              { key: "label", label: "Earnings", width: 122 },
              { key: "rate", label: "Rate", width: 78 },
              { key: "hours", label: "Hours", width: 78 },
              { key: "amount", label: "Amount", width: 92 },
              { key: "ytd", label: "YTD", width: 94 },
            ]}
            rows={earnings.map((row) => ({
              label: row.label,
              rate: row.rate,
              hours: row.hours,
              amount: row.amountText,
              ytd: row.ytdText,
            }))}
            total={{
              label: "Total",
              amount: totals.gross,
              ytd: totals.grossYtd,
            }}
          />
        </div>

        <div style={{ marginTop: 28, border: CELL_BORDER, borderTop: "none" }}>
          <Table
            striped
            columns={LINE_ITEM_COLUMNS}
            rows={toRows(taxes)}
            total={{
              label: "Total",
              amount: totals.taxes,
              ytd: totals.taxesYtd,
            }}
          />
        </div>
        {deductions.length > 0 && (
          <div
            style={{ marginTop: 28, border: CELL_BORDER, borderTop: "none" }}
          >
            <Table
              striped
              columns={LINE_ITEM_COLUMNS.map((col) =>
                col.key === "label" ? { ...col, label: "Deductions" } : col,
              )}
              rows={toRows(deductions)}
              total={{
                label: "Total",
                amount: totals.deductions,
                ytd: totals.deductionsYtd,
              }}
            />
          </div>
        )}
      </div>

      {/* Right column */}
      <div
        style={at(500, 420, {
          width: 296,
          height: 580,
          display: "flex",
          flexDirection: "column",
        })}
      >
        <SectionTitle>Employee Address</SectionTitle>
        <Boxed
          style={{
            minHeight: ROW_HEIGHT,
            lineHeight: "16px",
            padding: "4px 6px 3px",
            overflowWrap: "anywhere",
          }}
        >
          {[employee.address, employee.cityLine].filter(Boolean).join(", ")}
        </Boxed>

        <div style={{ height: 28, flexShrink: 0 }} />
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
                padding: "0 12px 0 6px",
                background: index === 1 ? "#e6e6e6" : "#ffffff",
                borderTop: index ? CELL_BORDER : "none",
              }}
            >
              <span style={{ fontWeight: 700 }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </Boxed>

        <div style={{ height: 28, flexShrink: 0 }} />
        <SectionTitle>Important Notes</SectionTitle>
        <div
          style={{
            marginTop: 6,
            flex: 1,
            minHeight: 120,
            background: "#dce7dd",
            border: CELL_BORDER,
            borderTop: "none",
          }}
        />
      </div>
    </div>
  );
};

export default CheckStatementTemplate;
