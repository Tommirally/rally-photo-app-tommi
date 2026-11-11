import { describe, expect, it } from "vitest";
import { ENTRY_CSV_TEMPLATE, parseCsv, parseEntryList, slugify } from "./entry-csv";

describe("parseCsv", () => {
  it("handles quotes, commas inside quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿No,Driver\r\n32,"Smith, J"\r\n"0""32",x\r\n')).toEqual([
      ["No", "Driver"],
      ["32", "Smith, J"],
      ['0"32', "x"],
    ]);
  });
  it("detects semicolon and tab separated files", () => {
    expect(parseCsv("No;Driver\n32;A")).toEqual([["No", "Driver"], ["32", "A"]]);
    expect(parseCsv("No\tDriver\n32\tA")).toEqual([["No", "Driver"], ["32", "A"]]);
  });
});

describe("parseEntryList", () => {
  it("reads a typical organiser entry list and keeps leading zeros", () => {
    const r = parseEntryList(
      "No.,Driver,Co-Driver,Make & Model,Class\n32,A Smith,B Jones,Ford Fiesta,4\n032, C Brown ,D Green,Peugeot 208,3\n320,E,F,Mini,2\n\n",
    );
    expect(r.problems).toEqual([]);
    expect(r.entries).toEqual([
      { row: 2, number: "32", competitors: ["A Smith", "B Jones"], vehicle: "Ford Fiesta", className: "4" },
      { row: 3, number: "032", competitors: ["C Brown", "D Green"], vehicle: "Peugeot 208", className: "3" },
      { row: 4, number: "320", competitors: ["E", "F"], vehicle: "Mini", className: "2" },
    ]);
    expect(r.warnings).toEqual(["32 and 032 are different cars. Check that's right – they will be searched separately."]);
  });

  it("accepts the downloadable template", () => {
    const r = parseEntryList(ENTRY_CSV_TEMPLATE);
    expect(r.problems).toEqual([]);
    expect(r.entries.map((e) => e.number)).toEqual(["1", "032"]);
  });

  it("normalises spaces and lower-case letters in numbers", () => {
    const r = parseEntryList("Car No,Driver\n h 12 ,A\n");
    expect(r.entries[0].number).toBe("H12");
  });

  it("blocks duplicates, blanks and invalid numbers", () => {
    const r = parseEntryList("No,Driver\n32,A\n,B\n32,C\n3#2,D\n");
    expect(r.problems).toEqual([
      "Row 3: no car number.",
      "Car 32 is listed twice (rows 2 and 4).",
      'Row 5: "3#2" isn\'t a valid car number (letters and digits only, up to 12).',
    ]);
  });

  it("explains when there is no number column", () => {
    const r = parseEntryList("Name,Car\nA,Ford\n");
    expect(r.problems[0]).toMatch(/Couldn't find the car number column/);
  });

  it("treats a 'Car' column as the vehicle, not the number", () => {
    const r = parseEntryList("No,Car\n7,Subaru Impreza\n");
    expect(r.entries[0]).toMatchObject({ number: "7", vehicle: "Subaru Impreza" });
  });

  it("warns about missing optional columns", () => {
    expect(parseEntryList("No\n1\n").warnings[0]).toMatch(/No Driver \/ Car \/ Class column/);
  });

  it("rejects an empty file", () => {
    expect(parseEntryList("").problems).toEqual(["The file is empty."]);
  });
});

describe("slugify", () => {
  it("makes web addresses", () => {
    expect(slugify("Malton Forest Rally 2026")).toBe("malton-forest-rally-2026");
    expect(slugify("  Côte & Country Stages!! ")).toBe("cote-and-country-stages");
    expect(slugify("!!!")).toBe("event");
  });
});
