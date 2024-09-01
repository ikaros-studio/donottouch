// data.js

// Import the global temperature data from the dataset
import globalTempData from "../datasets/data.js";

// Initialize the variables
export let year = 1979;
export let globalTemp = globalTempData;

// Function to fetch a data point
export const fetchDataPoint = () => {
    year += 1;
    if (year > 2023) {
        year = 1979;
    }

    const newYear = year.toString();
    const newTemp = globalTemp.data[year];

    document.getElementById("yearNumber").innerText = "Year: " + newYear + " | Temp: " + newTemp + "°C";
};
