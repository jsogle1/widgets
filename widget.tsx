import React, { useState } from 'react';
import { JimuMapViewComponent } from 'jimu-arcgis';
import esriLoader from 'esri-loader';

const Widget = () => {
  const [clickedPoint, setClickedPoint] = useState(null);
  const [state, setState] = useState(null);
  const [region, setRegion] = useState(null);
  const [county, setCounty] = useState(null);
  const [city, setCity] = useState(null);

  const handleMapClick = async (event) => {
    // Extract the mapPoint from the click event.
    const { mapPoint } = event;

    // Create a point variable using the mapPoint.
    setClickedPoint(mapPoint);

    // Query the state, region, county, and city based on the clicked point's latitude and longitude.
    const {
      state: stateValue,
      region: regionValue,
      county: countyValue,
      city: cityValue,
    } = await queryAttributesFromFeatureServices(mapPoint.latitude, mapPoint.longitude);

    // Update the state, region, county, and city values.
    setState(stateValue);
    setRegion(regionValue);
    setCounty(countyValue);
    setCity(cityValue);
  };

  // Function to query attributes from the "Municipalities" feature service based on latitude and longitude.
  const queryAttributesFromFeatureServices = async (latitude, longitude) => {
    try {
      // Assuming you have an ArcGIS REST API endpoint for the "Municipalities" feature service.
      const municipalitiesServiceURL =
        'https://your-arcgis-server/arcgis/rest/services/MunicipalitiesService/FeatureServer/0';

      // Create a query task for the "Municipalities" feature service.
      const queryTask = new QueryTask({ url: municipalitiesServiceURL });

      // Create a query to find the state, region, county, and city based on the clicked point.
      const query = new Query();
      query.geometry = new Point({ latitude, longitude });

      // Specify the fields you want to retrieve for the "Municipalities" layer.
      query.outFields = ['State', 'Region', 'COUNTY', 'City']; // Adjust the field names as needed.

      // Execute the query and retrieve the feature.
      const result = await queryTask.execute(query);

      if (result.features.length > 0) {
        const attributes = result.features[0].attributes;

        // Assuming your "Municipalities" feature service has these attribute fields.
        const stateValue = attributes.State || 'State not found';
        const regionValue = attributes.Region || 'Region not found';
        const countyValue = attributes.COUNTY || 'County not found';
        const cityValue = attributes.City || 'City not found';

        return { state: stateValue, region: regionValue, county: countyValue, city: cityValue };
      } else {
        // Handle the case where no feature is found.
        return {
          state: 'State not found',
          region: 'Region not found',
          county: 'County not found',
          city: 'City not found',
        };
      }
    } catch (error) {
      console.error('Error querying attributes:', error);
      return {
        state: 'Error',
        region: 'Error',
        county: 'Error',
        city: 'Error',
      };
    }
  };

  return (
    <div>
      <h1>Site Location</h1>

      {/* Render a button to simulate a map click event */}
      <button onClick={() => handleMapClick({ mapPoint: { latitude: 123, longitude: 456 } })}>
        Simulate Map Click
      </button>

      {/* Render the clicked point information */}
      {clickedPoint && (
        <table>
          <caption>Site Location</caption>
          <tbody>
            <tr>
              <th>Latitude</th>
              <td>{clickedPoint.latitude}</td>
            </tr>
            <tr>
              <th>Longitude</th>
              <td>{clickedPoint.longitude}</td>
            </tr>
            <tr>
              <th>State</th>
              <td>{state}</td>
            </tr>
            <tr>
              <th>Region</th>
              <td>{region}</td>
            </tr>
            <tr>
              <th>County</th>
              <td>{county}</td>
            </tr>
            <tr>
              <th>City</th>
              <td>{city}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Widget;
