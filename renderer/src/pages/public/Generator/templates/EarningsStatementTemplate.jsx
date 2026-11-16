import CompanyLogo from "./CompanyLogo";

const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1056;

const LINED_BACKGROUND = {
  // Soft stops so the lines don't moiré when the page is scaled down in previews.
  backgroundImage: "repeating-linear-gradient(180deg, #dce2eb 0, #ffffff 1.5px, #dce2eb 3px)",
};
const GRAY_BAND = "#d9d9d9";
const RULE = "1.5px solid #9a9a9a";

const at = (left, top, extra) => ({ position: "absolute", left, top, ...extra });

// Column geometry of the earnings/deduction table, relative to its left edge.
const COL = {
  label: 2,
  sub: { left: 96, width: 207 },
  subLabel: 100,
  rate: { left: 111, width: 52 },
  hours: { left: 191, width: 42 },
  amount: { left: 206, width: 95 },
  ytd: { left: 314, width: 88 },
};

const Cell = ({ left, width, align = "left", bold, children }) => (
  <span
    style={{
      position: "absolute",
      left,
      width,
      textAlign: align,
      fontWeight: bold ? 700 : undefined,
      whiteSpace: "nowrap",
      overflow: "hidden",
    }}
  >
    {children}
  </span>
);

const ROW_HEIGHT = 15;

const TableRow = ({ label, labelLeft, rate, hours, amount, ytd }) => (
  <div style={{ position: "relative", height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px` }}>
    <Cell left={labelLeft} width={(rate === undefined ? COL.amount.left + 40 : COL.rate.left) - labelLeft}>
      {label}
    </Cell>
    {rate !== undefined && <Cell {...COL.rate} align="right">{rate}</Cell>}
    {hours !== undefined && <Cell {...COL.hours} align="right">{hours}</Cell>}
    <Cell {...COL.amount} align="right">{amount}</Cell>
    <Cell {...COL.ytd} align="right">{ytd}</Cell>
  </div>
);

const BandRow = ({ label, amount, shaded = true, topBorder = true }) => (
  <div
    style={{
      position: "relative",
      height: 17,
      marginLeft: COL.sub.left,
      width: COL.sub.width,
      background: shaded ? GRAY_BAND : "transparent",
      borderTop: topBorder ? RULE : "none",
      borderBottom: RULE,
      lineHeight: "15px",
      fontWeight: 700,
    }}
  >
    <Cell left={COL.subLabel - COL.sub.left} width={100}>{label}</Cell>
    <Cell left={COL.amount.left - COL.sub.left} width={COL.amount.width} align="right">{amount}</Cell>
  </div>
);

const SectionHeader = ({ label, subLabel, columns }) => {
  const ruleTop = subLabel ? 18 : 16;
  return (
    <div style={{ position: "relative", height: 21, fontWeight: 700 }}>
      <span style={at(COL.label, 0)}>{label}</span>
      <div style={at(0, 16, { width: 79, borderBottom: RULE })} />
      {subLabel && <span style={at(COL.subLabel, 2)}>{subLabel}</span>}
      {columns && (
        <>
          <Cell {...COL.rate} align="right" bold>Rate</Cell>
          <Cell {...COL.hours} align="right" bold>Hours</Cell>
          <Cell {...COL.amount} align="right" bold>Amount</Cell>
          <Cell {...COL.ytd} align="right" bold>Year to Date</Cell>
        </>
      )}
      <div style={at(COL.sub.left, ruleTop, { width: COL.sub.width, borderBottom: RULE })} />
      <div style={at(COL.ytd.left, ruleTop, { width: 90, borderBottom: RULE })} />
    </div>
  );
};

const DeductionRows = ({ items }) =>
  items.map((item, index) => (
    <TableRow
      key={`${item.label}-${index}`}
      labelLeft={COL.subLabel}
      label={item.label}
      amount={item.negativeText}
      ytd={item.ytdText}
    />
  ));

/** Template 09 — ADP-style "Earnings Statement" with a voided advice check. */
const EarningsStatementTemplate = ({ data }) => {
  const { company, employee, period, earnings, taxes, deductions, totals, reference } = data;

  return (
    <div
      style={{
        position: "relative",
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        background: "#ffffff",
        color: "#111111",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 11,
        lineHeight: 1.35,
        overflow: "hidden",
      }}
    >
      {/* Company code box */}
      <div style={at(141, 42, { width: 219, height: 35, background: GRAY_BAND, fontSize: 9.5, padding: "3px 6px", boxSizing: "border-box" })}>
        <table style={{ borderCollapse: "collapse", lineHeight: "14px" }}>
          <tbody>
            <tr>
              {["CO.", "FILE", "DEPT", "CLOCK", "VCHR. NO"].map((h) => (
                <td key={h} style={{ paddingRight: 7, whiteSpace: "nowrap" }}>{h}</td>
              ))}
            </tr>
            <tr>
              {[reference.companyCode, reference.fileNumber, reference.department, reference.clock, reference.voucher].map((v, i) => (
                <td key={i} style={{ paddingRight: 7, whiteSpace: "nowrap", textAlign: i === 4 ? "center" : "left" }}>{v}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={at(476, 43, { fontSize: 19, fontWeight: 700 })}>Earnings Statement</div>
      {/* Company (an uploaded logo sits on the left, separated by a divider) */}
      <div style={at(141, 88, { display: "flex", alignItems: "center", gap: 10 })}>
        {company.logo && (
          <>
            <CompanyLogo src={company.logo} boxWidth={70} boxHeight={54} shrink />
            <div style={{ alignSelf: "stretch", width: 1, background: "#9a9a9a" }} />
          </>
        )}
        <div style={{ width: company.logo ? 220 : 300, fontWeight: 700, fontStyle: "italic", fontSize: 11.5, lineHeight: "15.5px" }}>
          <div>{company.name}</div>
          <div>{company.address}</div>
          <div>{company.cityLine}</div>
          {company.phone && <div>{company.phone}</div>}
        </div>
      </div>

      {/* Period */}
      <div style={at(476, 91, { fontSize: 11.5, lineHeight: "15.5px" })}>
        {[
          ["Period Beginning:", period.start],
          ["Period Ending:", period.end],
          ["Pay Date:", period.payDate],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "flex" }}>
            <span style={{ width: 168 }}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>

      {/* Employee */}
      <div style={at(476, 146, { width: 280, fontWeight: 700, fontStyle: "italic", fontSize: 11.5, lineHeight: "15.5px" })}>
        <div>{employee.name}</div>
        <div>{employee.address}</div>
        <div>{employee.cityLine}</div>
      </div>

      {/* Employee tax info */}
      <div style={at(145, 186, { fontSize: 10.5, lineHeight: "14.5px" })}>
        {[
          ["Social Security Number:", employee.ssnMasked],
          ["Pay Frequency:", period.frequency],
          ["Employer EIN:", company.ein],
          ["Employee ID:", employee.id],
        ].map(([label, value]) => (
          <div key={label} style={{ display: "flex" }}>
            <span style={{ width: 129 }}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>

      {/* Left column: earnings & deductions */}
      <div style={at(57, 289, { width: 404, height: 438, ...LINED_BACKGROUND })} />
      <div style={at(57, 270, { width: 404, fontSize: 10.5 })}>
        <SectionHeader label="Earnings" columns />
        {earnings.map((row, index) => (
          <TableRow
            key={`${row.label}-${index}`}
            labelLeft={COL.label}
            label={row.label}
            rate={row.rate}
            hours={row.hours}
            amount={row.amountText}
            ytd={row.ytdText}
          />
        ))}
        <BandRow label="Gross Pay" amount={totals.gross} />

        <div style={{ height: 48 }} />

        <SectionHeader label="Deduction" subLabel="Statutory" />
        <DeductionRows items={taxes} />
        {deductions.length > 0 && (
          <>
            <div style={{ position: "relative", height: 17, lineHeight: "17px", fontWeight: 700 }}>
              <span style={at(COL.subLabel, 0)}>Voluntary</span>
            </div>
            <DeductionRows items={deductions} />
          </>
        )}
        <BandRow label="Net Pay" amount={totals.net} />
        <BandRow label="Check" amount={totals.netNegative} shaded={false} topBorder={false} />
      </div>

      {/* Right column */}
      <div style={at(476, 248, { width: 280, fontSize: 11, fontWeight: 700, lineHeight: "15.5px" })}>
        <div>Other benefits and</div>
        <div style={{ position: "relative", height: 16 }}>
          <span style={at(0, 0)}>Information</span>
          <span style={at(105, 0, { width: 70, textAlign: "right" })}>This Period</span>
          <span style={at(180, 0, { width: 100, textAlign: "right" })}>Year To Date</span>
        </div>
      </div>
      <div style={at(476, 281, { width: 280, borderBottom: RULE })} />
      <div style={at(476, 287, { width: 280, height: 64, ...LINED_BACKGROUND })} />

      <div style={at(476, 366, { fontSize: 11, fontWeight: 700 })}>Important Notes</div>
      <div style={at(476, 384, { width: 280, borderBottom: RULE })} />
      <div style={at(476, 388, { width: 280, height: 335, ...LINED_BACKGROUND })} />

      {/* Tear line */}
      <div
        style={at(57, 753, {
          width: 701,
          height: 2,
          backgroundImage: "repeating-linear-gradient(90deg, #333333 0 12px, transparent 12px 20px)",
        })}
      />

      {/* Voided check */}
      <div style={at(company.logo ? 64 : 80, 796, { display: "flex", alignItems: "center", gap: 8 })}>
        {company.logo && (
          <>
            <CompanyLogo src={company.logo} boxWidth={100} boxHeight={60} shrink />
            <div style={{ alignSelf: "stretch", width: 1, background: "#9a9a9a" }} />
          </>
        )}
        <div style={{ fontSize: 11.5, lineHeight: "15.5px", whiteSpace: "nowrap" }}>
          <div>{company.name}</div>
          <div>{company.address}</div>
          <div>{company.cityLine}</div>
          {company.phone && <div>{company.phone}</div>}
        </div>
      </div>
      <div style={at(474, 796, { fontSize: 11.5, lineHeight: "15.5px" })}>
        {[
          ["Advice Number:", reference.adviceNumber, true],
          ["Pay date:", period.payDate],
          ["Social Security Number:", employee.ssnMasked],
        ].map(([label, value, bold]) => (
          <div key={label} style={{ display: "flex" }}>
            <span style={{ width: 159, fontWeight: bold ? 700 : 400 }}>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>

      <div style={at(178, 873, { fontSize: 9, lineHeight: "12px" })}>
        <div>Pay to the</div>
        <div>order of:</div>
      </div>
      <div style={at(247, 877, { fontSize: 15, fontWeight: 700, maxWidth: 480, whiteSpace: "nowrap" })}>
        {employee.name}
      </div>
      <div style={at(176, 897, { width: 563, borderTop: RULE })} />
      <div style={at(178, 902, { fontSize: 9.5 })}>This amount:</div>
      <div
        style={at(243, 897, {
          width: 496,
          height: 21,
          borderLeft: RULE,
          borderRight: RULE,
          borderBottom: RULE,
          boxSizing: "border-box",
          fontSize: 9.5,
          lineHeight: "19px",
        })}
      >
        <span style={at(6, 0, { width: 390, whiteSpace: "nowrap", overflow: "hidden" })}>{totals.netWords}</span>
        <div style={at(398, -1, { height: 21, borderLeft: RULE })} />
        <span style={at(400, 0, { width: 88, textAlign: "right" })}>{totals.net}</span>
      </div>

      <div style={at(544, 931, { fontSize: 16, fontWeight: 700 })}>NON-NEGOTIABLE</div>
      <div style={at(544, 951, { fontSize: 14 })}>VOIDED CHECK</div>
    </div>
  );
};

export default EarningsStatementTemplate;
