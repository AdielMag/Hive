/**
 * JetBrains Rider colour schemes ("Rider Dark" / "Rider Light") expressed as TextMate themes for shiki.
 * Token colours follow Rider's semantic palette: blue keywords, purple types, teal methods, cyan fields,
 * tan strings, pink numbers, green comments.
 */
import type { ThemeRegistration } from "shiki/core";

interface Palette {
  fg: string;
  bg: string;
  keyword: string;
  string: string;
  escape: string;
  number: string;
  comment: string;
  docComment: string;
  type: string;
  struct: string;
  method: string;
  field: string;
  variable: string;
  parameter: string;
  constant: string;
  namespace: string;
  operator: string;
  tag: string;
  attribute: string;
  annotation: string;
  regex: string;
  heading: string;
  link: string;
  inserted: string;
  deleted: string;
  invalid: string;
}

const RIDER_DARK: Palette = {
  fg: "#BDBDBD",
  bg: "#1E1F22",
  keyword: "#6C95EB",
  string: "#C9A26D",
  escape: "#D688D4",
  number: "#ED94C0",
  comment: "#85C46C",
  docComment: "#85C46C",
  type: "#C191FF",
  struct: "#E1BFFF",
  method: "#39CC9B",
  field: "#66C3CC",
  variable: "#BDBDBD",
  parameter: "#BDBDBD",
  constant: "#EE7DB0",
  namespace: "#BDBDBD",
  operator: "#BDBDBD",
  tag: "#6C95EB",
  attribute: "#BDBDBD",
  annotation: "#E0C46C",
  regex: "#D688D4",
  heading: "#6C95EB",
  link: "#6C95EB",
  inserted: "#57AB5A",
  deleted: "#E5534B",
  invalid: "#FF5647",
};

const RIDER_LIGHT: Palette = {
  fg: "#222222",
  bg: "#FFFFFF",
  keyword: "#0F54D6",
  string: "#8C6C41",
  escape: "#8B2BB9",
  number: "#C4369D",
  comment: "#3C7A2E",
  docComment: "#3C7A2E",
  type: "#7438C9",
  struct: "#9B3BC9",
  method: "#00797B",
  field: "#0B7A9A",
  variable: "#222222",
  parameter: "#222222",
  constant: "#B4237A",
  namespace: "#222222",
  operator: "#222222",
  tag: "#0F54D6",
  attribute: "#7438C9",
  annotation: "#9E7C00",
  regex: "#8B2BB9",
  heading: "#0F54D6",
  link: "#0F54D6",
  inserted: "#1A7F37",
  deleted: "#CF222E",
  invalid: "#D1242F",
};

function toTheme(name: string, type: "dark" | "light", p: Palette): ThemeRegistration {
  const s = (scope: string | string[], foreground: string, fontStyle?: string) => ({
    scope,
    settings: fontStyle ? { foreground, fontStyle } : { foreground },
  });
  return {
    name,
    type,
    colors: { "editor.background": p.bg, "editor.foreground": p.fg },
    fg: p.fg,
    bg: p.bg,
    settings: [
      { settings: { foreground: p.fg, background: p.bg } },
      s(["comment", "punctuation.definition.comment"], p.comment, "italic"),
      s(["comment.block.documentation", "comment.block.javadoc", "storage.type.class.jsdoc", "entity.name.type.instance.jsdoc"], p.docComment, "italic"),
      s(["string", "string.quoted", "string.template", "punctuation.definition.string", "string.unquoted.plain"], p.string),
      s(["constant.character.escape", "constant.other.placeholder", "punctuation.definition.template-expression", "punctuation.section.embedded"], p.escape),
      s(["string.regexp", "constant.other.character-class.regexp"], p.regex),
      s(["constant.numeric", "constant.other.color", "keyword.other.unit"], p.number),
      s(
        [
          "keyword",
          "keyword.control",
          "keyword.other",
          "keyword.operator.new",
          "keyword.operator.expression",
          "keyword.operator.logical.python",
          "keyword.operator.wordlike",
          "storage",
          "storage.type",
          "storage.modifier",
          "constant.language",
          "variable.language",
          "support.type.primitive",
          "support.type.builtin",
          "keyword.type",
          "entity.name.type.primitive",
          "storage.type.primitive",
          "storage.type.built-in",
        ],
        p.keyword,
      ),
      s(["keyword.operator", "punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator"], p.operator),
      s(
        [
          "entity.name.type",
          "entity.name.class",
          "entity.name.interface",
          "entity.other.inherited-class",
          "support.class",
          "support.type",
          "entity.name.type.class",
          "entity.name.type.interface",
          "entity.name.type.alias",
          "meta.type.annotation entity.name.type",
          "storage.type.cs",
          "storage.type.java",
          "entity.name.type.parameter",
        ],
        p.type,
      ),
      s(["entity.name.type.struct", "entity.name.type.enum", "entity.name.struct", "entity.name.enum", "storage.type.struct"], p.struct),
      s(
        [
          "entity.name.function",
          "support.function",
          "meta.function-call entity.name.function",
          "entity.name.method",
          "meta.method-call",
          "variable.function",
          "support.function.builtin",
        ],
        p.method,
      ),
      s(
        [
          "variable.other.property",
          "variable.other.object.property",
          "meta.object-literal.key",
          "support.variable.property",
          "variable.other.member",
          "entity.name.variable.field",
          "entity.name.variable.property",
          "support.type.property-name",
          "meta.property-name",
          "variable.other.field",
          "entity.name.tag.yaml",
          "support.type.property-name.json",
          "support.type.property-name.toml",
        ],
        p.field,
      ),
      s(["variable", "variable.other.readwrite", "meta.definition.variable", "variable.other.local"], p.variable),
      s(["variable.parameter", "meta.parameter"], p.parameter),
      // TS marks every `const` local as variable.other.constant; Rider renders locals plainly.
      s(["variable.other.constant"], p.variable),
      s(["variable.other.enummember", "entity.name.constant", "support.constant", "constant.other", "variable.other.constant.property"], p.constant),
      s(["entity.name.namespace", "entity.name.module", "entity.name.package", "storage.modifier.import"], p.namespace),
      s(["entity.name.tag", "punctuation.definition.tag", "support.class.component"], p.tag),
      s(["entity.other.attribute-name", "entity.other.attribute-name.html"], p.attribute),
      s(["entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css", "entity.name.tag.css"], p.type),
      s(["support.type.property-name.css", "support.type.vendored.property-name.css"], p.field),
      s(["support.constant.property-value.css", "support.constant.font-name"], p.string),
      s(["meta.decorator", "entity.name.function.decorator", "punctuation.decorator", "storage.type.annotation", "meta.attribute", "entity.name.function.macro", "support.function.macro"], p.annotation),
      s(["markup.heading", "entity.name.section", "markup.heading punctuation.definition.heading"], p.heading, "bold"),
      s("markup.bold", p.fg, "bold"),
      s("markup.italic", p.fg, "italic"),
      s(["markup.inline.raw", "markup.fenced_code"], p.string),
      s(["markup.underline.link", "string.other.link"], p.link),
      s(["markup.list punctuation.definition.list.begin", "punctuation.definition.list"], p.keyword),
      s(["markup.quote"], p.comment, "italic"),
      s(["markup.inserted", "punctuation.definition.inserted"], p.inserted),
      s(["markup.deleted", "punctuation.definition.deleted"], p.deleted),
      s(["meta.diff.header", "meta.diff.range", "meta.diff.index"], p.keyword),
      s("invalid", p.invalid),
    ],
  };
}

export const riderDark = toTheme("rider-dark", "dark", RIDER_DARK);
export const riderLight = toTheme("rider-light", "light", RIDER_LIGHT);
