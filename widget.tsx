import React, { useState, useEffect } from 'react';
import { JimuMapViewComponent } from 'jimu-arcgis';
import { Point } from 'esri/geometry';

const Widget = () => {
  const [clickedPoint, setClickedPoint] = useState(null);
  const [state, setState] = useState(null);
  const [county, setCounty] = useState(null);
  const [city, setCity] = useState(null);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

  // Define a function to handle map click events
  const handleMapClick = async (jimuMapView) => {
    try {
      // Get the map view from JimuMapViewComponent
      const mapView = await jimuMapView.view;

      // Listen for a single click event on the map view
      const clickHandler = mapView.on('click', async (event) => {
        // Extract the mapPoint from the click event.
        const { mapPoint } = event;

        // Create a point variable using the mapPoint.
        setClickedPoint(mapPoint);

        // Query the state, county, and city based on the clicked point's latitude and longitude.
        const {
          state: stateValue,
          county: countyValue,
          city: cityValue,
        } = await queryAttributesFromFeatureServices(mapPoint.latitude, mapPoint.longitude);

        // Update the state, county, and city values.
        setState(stateValue);
        setCounty(countyValue);
        setCity(cityValue);

        // Set the latitude and longitude based on the clicked point
        setLatitude(mapPoint.latitude.toFixed(3));
        setLongitude(mapPoint.longitude.toFixed(3));

        // Remove the click handler after a single click
        clickHandler.remove();
      });
    } catch (error) {
      console.error('Error handling map click:', error);
    }
  };

  // Function to query attributes from the "Municipalities" feature service based on latitude and longitude.
  const queryAttributesFromFeatureServices = async (latitude, longitude) => {
    try {
      // Define the URL of your feature service
      const municipalitiesServiceURL =
        'https://your-arcgis-server/arcgis/rest/services/MunicipalitiesService/FeatureServer/0';

      // Create a query task for the feature service
      const queryTask = new QueryTask({ url: municipalitiesServiceURL });

      // Create a query to find the features near the clicked point
      const query = new Query();
      query.geometry = new Point({ latitude, longitude });

      // Specify the fields you want to retrieve from the feature service
      query.outFields = ['STATE', 'COUNTY', 'NAME']; // Updated field names

      // Execute the query and retrieve the feature
      const result = await queryTask.execute(query);

      if (result.features.length > 0) {
        const attributes = result.features[0].attributes;

        // Assuming your feature service has these attribute fields
        const stateValue = attributes.STATE || 'State not found'; // Updated field name
        const countyValue = attributes.COUNTY || 'County not found'; // Updated field name
        const cityValue = attributes.NAME || 'City not found'; // Updated field name

        return { state: stateValue, county: countyValue, city: cityValue };
      } else {
        // Handle the case where no feature is found
        return {
          state: 'State not found',
          county: 'County not found',
          city: 'City not found',
        };
      }
    } catch (error) {
      console.error('Error querying attributes:', error);
      return {
        state: 'Error',
        county: 'Error',
        city: 'Error',
      };
    }
  };

  return (
    <div>
      <h1>Site Location</h1>

      {/* Render the JimuMapViewComponent to listen for map clicks */}
      <JimuMapViewComponent onActiveViewChange={handleMapClick} />

      {/* Render the clicked point information */}
      {clickedPoint && (
        <table>
          <caption>Site Location</caption>
          <tbody>
            <tr>
              <th>Latitude</th>
              <td>{latitude}</td>
            </tr>
            <tr>
              <th>Longitude</th>
              <td>{longitude}</td>
            </tr>
            <tr>
              <th>State</th>
              <td>{state}</td>
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
