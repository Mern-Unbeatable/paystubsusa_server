import EarningsStatementTemplate from "./EarningsStatementTemplate";
import CheckStatementTemplate from "./CheckStatementTemplate";

/** Full-page document for templates that define a `document` key in templates.json. */
const TemplateDocument = ({ template, data }) => {
  switch (template?.document) {
    case "earnings-statement":
      return <EarningsStatementTemplate data={data} />;
    case "check-statement":
      return <CheckStatementTemplate data={data} />;
    default:
      return null;
  }
};

export default TemplateDocument;
