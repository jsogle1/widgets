import React, { useState } from 'react';
import { JimuMapViewComponent } from 'jimu-arcgis';
import esriLoader from 'esri-loader';

const Widget = () => {
  const [clickedPoint, setClickedPoint] = useState(null);
  const [stateAttribute, setStateAttribute] = useState(null);
  const [countyAttribute, setCountyAttribute] = useState(null);
  const [cityAttribute, setCityAttribute] = useState(null);

  const handleMapClick = async (event) => {
    // Extract the mapPoint from the click event.
    const { mapPoint } = event;

    // Create a point variable using the mapPoint.
    setClickedPoint(mapPoint);

    // Query the state, county, and city based on the clicked point's latitude and longitude.
    const { stateAttribute: stateValue, countyAttribute: countyValue, cityAttribute: cityValue } = await queryAttributesFromFeatureServices(
      mapPoint.latitude,
      mapPoint.longitude
    );

    // Update the state, county, and city values.
    setStateAttribute(stateValue);
    setCountyAttribute(countyValue);
    setCityAttribute(cityValue);
  };

  // Function to query attributes from the "Municipalities" feature service based on latitude and longitude.
  const queryAttributesFromFeatureServices = async (latitude, longitude) => {
    try {
      // Assuming you have an ArcGIS REST API endpoint for the "Municipalities" feature service.
      const municipalitiesServiceURL =
        'https://your-arcgis-server/arcgis/rest/services/MunicipalitiesService/FeatureServer/0';

      // Create a query task for the "Municipalities" feature service.
      const queryTask = new QueryTask({ url: municipalitiesServiceURL });

      // Create a query to find the state, county, and city based on the clicked point.
      const query = new Query();
      query.geometry = new Point({ latitude, longitude });

      // Specify the fields you want to retrieve for the "Municipalities" layer.
      query.outFields = ['STATE', 'COUNTY', 'NAME']; // Adjust the field names as needed.

      // Execute the query and retrieve the feature.
      const result = await queryTask.execute(query);

      if (result.features.length > 0) {
        const attributes = result.features[0].attributes;

        // Use the specific attribute names for state, county, and city.
        const stateValue = attributes.STATE || 'State not found';
        const countyValue = attributes.COUNTY || 'County not found';
        const cityValue = attributes.NAME || 'City not found';

        return { stateAttribute: stateValue, countyAttribute: countyValue, cityAttribute: cityValue };
      } else {
        // Handle the case where no feature is found.
        return {
          stateAttribute: 'State not found',
          countyAttribute: 'County not found',
          cityAttribute: 'City not found',
        };
      }
    } catch (error) {
      console.error('Error querying attributes:', error);
      return {
        stateAttribute: 'Error',
        countyAttribute: 'Error',
        cityAttribute: 'Error',
      };
    }
  };

  return (
    <div>
      <h1>Site Location</h1>

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
              <td>{stateAttribute}</td>
            </tr>
            <tr>
              <th>County</th>
              <td>{countyAttribute}</td>
            </tr>
            <tr>
              <th>City</th>
              <td>{cityAttribute}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Widget;
