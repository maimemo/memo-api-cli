import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { printJson, printColumns, printSuccess, setColor, setShowHeader, setSelectedFields } from "../src/output.js";

describe("output", () => {
  beforeEach(() => {
    setColor(true);
    setShowHeader(true);
    setSelectedFields("");
  });

  describe("printJson", () => {
    it("outputs formatted JSON to stdout", () => {
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printJson({ key: "value" });
        assert.equal(captured, '{\n  "key": "value"\n}\n');
      } finally {
        process.stdout.write = original;
      }
    });
  });

  describe("printColumns", () => {
    it("outputs tab-separated columns padded to width", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", name: "foo" },
          { id: "12345", name: "x" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[0]!.startsWith("id"));
        assert.ok(lines[0]!.includes("\tname"));
        assert.ok(lines[1]!.startsWith("1"));
        assert.ok(lines[1]!.includes("\tfoo"));
        assert.ok(lines[2]!.startsWith("12345"));
        assert.ok(lines[2]!.includes("\tx") && !lines[2]!.endsWith(" "));
      } finally {
        process.stdout.write = original;
      }
    });

    it("aligns columns with CJK characters", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "np-x", title: "暂无简介", brief: "desc" },
          { id: "np-y", title: "A Long English Title Here", brief: "x" },
        ]);
        const lines = captured.split("\n").filter(Boolean);

        const tabs0 = (lines[1]!.match(/\t/g) || []).length;
        const tabs1 = (lines[2]!.match(/\t/g) || []).length;
        assert.equal(tabs0, tabs1);

        const row1col1 = lines[1]!.split("\t")[1]!;
        assert.ok(row1col1.length > 4, "暂无简介 should have visual padding to match English title width");
      } finally {
        process.stdout.write = original;
      }
    });

    it("handles empty rows", () => {
      let captured = "";
      const original = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stderr.write;

      try {
        printColumns([]);
        assert.ok(captured.includes("(empty)"));
      } finally {
        process.stderr.write = original;
      }
    });

    it("no-color mode omits ANSI codes", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ a: "x" }]);
        assert.doesNotMatch(captured, /\x1b\[/);
        assert.ok(captured.startsWith("a"));
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("skips header when --no-header is set", () => {
      setColor(false);
      setShowHeader(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", name: "foo" },
          { id: "2", name: "bar" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        assert.equal(lines.length, 2);
        assert.ok(lines[0]!.startsWith("1"));
        assert.ok(lines[1]!.startsWith("2"));
      } finally {
        process.stdout.write = original;
        setShowHeader(true);
      }
    });

    it("shows only selected fields when --fields is set", () => {
      setColor(false);
      setSelectedFields("name,id");
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", name: "foo", extra: "x" },
          { id: "2", name: "bar", extra: "y" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[0]!.startsWith("name"));
        assert.ok(lines[0]!.includes("\tid"));
        assert.ok(!lines[0]!.includes("extra"));
      } finally {
        process.stdout.write = original;
        setSelectedFields("");
      }
    });

    it("collapses newlines in cell content", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", note: "line1\nline2\nline3" }]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[1]!.includes("line1 line2 line3"));
        assert.ok(!lines[1]!.includes("\n"));
      } finally {
        process.stdout.write = original;
      }
    });

    it("truncates content longer than 200 chars", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        const longText = "a".repeat(250);
        printColumns([{ id: "1", text: longText }]);
        const lines = captured.split("\n").filter(Boolean);
        const cell = lines[1]!.split("\t")[1]!;
        assert.ok(cell.endsWith("..."));
        assert.ok(cell.length < longText.length);
        assert.ok(cell.startsWith("a"));
        assert.equal(cell.length, 203); // 200 chars + "..."
      } finally {
        process.stdout.write = original;
      }
    });

    it("--fields with + prefix adds fields to defaults", () => {
      setColor(false);
      setSelectedFields("+extra");
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", name: "foo", extra: "x" },
          { id: "2", name: "bar", extra: "y" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[0]!.includes("id"));
        assert.ok(lines[0]!.includes("name"));
        assert.ok(lines[0]!.includes("extra"));
      } finally {
        process.stdout.write = original;
        setSelectedFields("");
      }
    });

    it("--fields with - prefix removes fields from defaults", () => {
      setColor(false);
      setSelectedFields("-name,extra");
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", name: "foo", extra: "x" },
          { id: "2", name: "bar", extra: "y" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[0]!.includes("id"));
        assert.ok(!lines[0]!.includes("name"));
        assert.ok(!lines[0]!.includes("extra"));
      } finally {
        process.stdout.write = original;
        setSelectedFields("");
      }
    });

    it("--fields with - removes id fields", () => {
      setColor(false);
      setSelectedFields("-id");
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", name: "foo" },
          { id: "2", name: "bar" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[0]!.includes("name"));
        assert.ok(!lines[0]!.includes("id"));
      } finally {
        process.stdout.write = original;
        setSelectedFields("");
      }
    });

    it("--fields +updated_time finds field from spread data", () => {
      setColor(false);
      setSelectedFields("+updated_time");
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "n1", note_type: "谐音", note: "test", status: "A", updated_time: "2024-01-01" },
        ]);
        const header = captured.split("\n")[0]!;
        assert.ok(header.includes("id"), "should include default id");
        assert.ok(header.includes("note_type"), "should include default note_type");
        assert.ok(header.includes("note"), "should include default note");
        assert.ok(header.includes("status"), "should include default status");
        assert.ok(header.includes("updated_time"), "should include added updated_time");
      } finally {
        process.stdout.write = original;
        setSelectedFields("");
      }
    });

    it("displays array values as JSON array", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", tags: ["a", "b", "c"] }]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[1]!.includes('["a","b","c"]'));
      } finally {
        process.stdout.write = original;
      }
    });

    it("displays object values as JSON string", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", meta: { key: "value", num: 42 } }]);
        const lines = captured.split("\n").filter(Boolean);
        assert.ok(lines[1]!.includes('{"key":"value","num":42}'));
      } finally {
        process.stdout.write = original;
      }
    });

    it("displays null and undefined as empty", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", nullable: null, missing: undefined, present: "ok" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        const cols = lines[1]!.split("\t");
        const headerCols = lines[0]!.split("\t");
        const nullableIdx = headerCols.indexOf("nullable");
        const missingIdx = headerCols.indexOf("missing");
        const presentIdx = headerCols.indexOf("present");
        assert.equal(cols[nullableIdx]!.trim(), "");
        assert.equal(cols[missingIdx]!.trim(), "");
        assert.equal(cols[presentIdx]!.includes("ok"), true);
      } finally {
        process.stdout.write = original;
      }
    });

    it("shows only configured default fields when entity is provided", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns(
          [
            { id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED", voc_id: "v1", updated_time: "2024" },
          ],
          "note",
        );
        const header = captured.split("\n")[0]!;
        assert.ok(header.includes("id"));
        assert.ok(header.includes("note_type"));
        assert.ok(header.includes("note"));
        assert.ok(header.includes("status"));
        assert.ok(!header.includes("voc_id"), "voc_id should be hidden by default config");
        assert.ok(!header.includes("updated_time"), "updated_time should be hidden");
      } finally {
        process.stdout.write = original;
      }
    });

    it("--fields +extra adds to default fields, not all fields", () => {
      setColor(false);
      setSelectedFields("+updated_time");
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns(
          [
            { id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED", voc_id: "v1", updated_time: "2024" },
          ],
          "note",
        );
        const header = captured.split("\n")[0]!;
        // defaults still present
        assert.ok(header.includes("id"));
        assert.ok(header.includes("note_type"));
        assert.ok(header.includes("note"));
        assert.ok(header.includes("status"));
        // added field shows
        assert.ok(header.includes("updated_time"), "updated_time should be added");
        // voc_id is NOT a default and was NOT explicitly added — should NOT show
        assert.ok(!header.includes("voc_id"), "voc_id is not a default field, should not appear");
      } finally {
        process.stdout.write = original;
        setSelectedFields("");
      }
    });

    it("converts time fields from ISO date to local timezone format", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", updated_time: "2024-06-15T08:30:00Z", note: "test" },
        ]);
        const dataLine = captured.split("\n")[1]!;
        const cols = dataLine.split("\t");
        const headerCols = captured.split("\n")[0]!.split("\t");
        const timeIdx = headerCols.findIndex((c) => c.trim() === "updated_time");
        assert.ok(timeIdx >= 0, "updated_time column should exist");
        const timeCell = cols[timeIdx]!;
        assert.match(timeCell.trim(), /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
        assert.ok(!timeCell.includes("T"));
        assert.ok(!timeCell.includes("Z"));
      } finally {
        process.stdout.write = original;
      }
    });

    it("does not convert non-date strings ending with time", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", build_time: "not-a-date", note: "test" },
        ]);
        const dataLine = captured.split("\n")[1]!;
        assert.ok(dataLine.includes("not-a-date"));
      } finally {
        process.stdout.write = original;
      }
    });

    it("does not convert pure numeric time values (durations) to dates", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", study_time: 3600, note: "test" },
          { id: "2", study_time: 0, note: "test" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        const row1 = lines[1]!.split("\t").map((c) => c.trim());
        const row2 = lines[2]!.split("\t").map((c) => c.trim());
        assert.strictEqual(row1[1], "3600", lines[1]);
        assert.strictEqual(row2[1], "0", lines[2]);
        assert.ok(!captured.includes("3600-01-01"), captured);
        assert.ok(!captured.includes("2000-01-01"), captured);
      } finally {
        process.stdout.write = original;
      }
    });

    it("displays empty array as empty cell", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", tags: [], note: "test" },
        ]);
        const dataLine = captured.split("\n")[1]!;
        assert.ok(!dataLine.includes("[]"), dataLine);
      } finally {
        process.stdout.write = original;
      }
    });

    it("converts _date fields from ISO to local timezone", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", next_study_date: "2026-01-15T00:00:00Z", note: "test" },
        ]);
        const dataLine = captured.split("\n")[1]!;
        assert.ok(dataLine.includes("2026-01-15"));
        assert.ok(!dataLine.includes("T"));
        assert.ok(!dataLine.includes("Z"));
      } finally {
        process.stdout.write = original;
      }
    });
  });

  describe("colorized enum values", () => {
    it("colors PUBLISHED status green", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", status: "PUBLISHED" }]);
        assert.ok(captured.includes("\x1b[32mPUBLISHED\x1b[39m"), "PUBLISHED should be green");
        assert.ok(!captured.includes("\x1b[32m1\x1b[39m"), "id should NOT be green");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("colors UNPUBLISHED status gray", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", status: "UNPUBLISHED" }]);
        assert.ok(captured.includes("\x1b[90mUNPUBLISHED\x1b[39m"), "UNPUBLISHED should be gray");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("colors DELETED status red", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", status: "DELETED" }]);
        assert.ok(captured.includes("\x1b[31mDELETED\x1b[39m"), "DELETED should be red");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("colors FAMILIAR last_response green", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ voc_id: "v1", voc_spelling: "test", last_response: "FAMILIAR" }]);
        assert.ok(captured.includes("\x1b[32mFAMILIAR\x1b[39m"), "FAMILIAR should be green");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("colors VAGUE last_response yellow", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ voc_id: "v1", voc_spelling: "test", last_response: "VAGUE" }]);
        assert.ok(captured.includes("\x1b[33mVAGUE\x1b[39m"), "VAGUE should be yellow");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("colors FORGET last_response red", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ voc_id: "v1", voc_spelling: "test", last_response: "FORGET" }]);
        assert.ok(captured.includes("\x1b[31mFORGET\x1b[39m"), "FORGET should be red");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("colors UNSPECIFIED status gray", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", status: "NOTE_STATUS_UNSPECIFIED" }]);
        assert.ok(captured.includes("\x1b[90mNOTE_STATUS_UNSPECIFIED\x1b[39m"));
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("colors is_new true green and false plain", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { voc_id: "v1", voc_spelling: "a", is_new: true },
          { voc_id: "v2", voc_spelling: "b", is_new: false },
        ]);
        assert.ok(captured.includes("\x1b[32mtrue\x1b[39m"), "true should be green");
        assert.ok(!captured.includes("\x1b[32mfalse"), "false should NOT be green");
        assert.ok(captured.includes("false"), "false should still be visible");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("no-color disables enum colorization", () => {
      setColor(false);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", status: "PUBLISHED" }]);
        assert.doesNotMatch(captured, /\x1b\[/);
        assert.ok(captured.includes("PUBLISHED"), "PUBLISHED text should be visible");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("column width calculation is unaffected by ANSI codes", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([
          { id: "1", status: "PUBLISHED" },
          { id: "12345", status: "DELETED" },
        ]);
        const lines = captured.split("\n").filter(Boolean);
        const tabs0 = (lines[1]!.match(/\t/g) || []).length;
        const tabs1 = (lines[2]!.match(/\t/g) || []).length;
        assert.equal(tabs0, tabs1, "column count should be consistent with ANSI");
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("WELL_FAMILIAR is colored green", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ voc_id: "v1", voc_spelling: "test", last_response: "WELL_FAMILIAR" }]);
        assert.ok(captured.includes("\x1b[32mWELL_FAMILIAR\x1b[39m"));
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });

    it("unknown status values are not colored", () => {
      setColor(true);
      let captured = "";
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stdout.write;

      try {
        printColumns([{ id: "1", status: "CUSTOM_STATUS" }]);
        assert.ok(captured.includes("CUSTOM_STATUS"));
        assert.ok(!captured.includes("CUSTOM_STATUS\x1b[39m"));
      } finally {
        process.stdout.write = original;
        setColor(true);
      }
    });
  });

  describe("printSuccess", () => {
    it("writes colored message to stderr", () => {
      setColor(true);
      let captured = "";
      const original = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stderr.write;

      try {
        printSuccess("已删除");
        assert.ok(captured.includes("已删除"));
      } finally {
        process.stderr.write = original;
        setColor(true);
      }
    });

    it("writes plain message when color disabled", () => {
      setColor(false);
      let captured = "";
      const original = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        captured += chunk;
        return true;
      }) as typeof process.stderr.write;

      try {
        printSuccess("已删除");
        assert.ok(captured.includes("已删除"));
        assert.doesNotMatch(captured, /\x1b\[/);
      } finally {
        process.stderr.write = original;
        setColor(true);
      }
    });
  });
});
