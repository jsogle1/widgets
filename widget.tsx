import React, { useEffect, useState } from 'react';
import { JimuMapViewComponent } from 'jimu-arcgis';
import esriLoader from 'esri-loader';

const ReportWidget = () => {
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [populationData, setPopulationData] = useState([]);
  const [locationData, setLocationData] = useState(null);
  const [jurisdictionData, setJurisdictionData] = useState(null);
  const [contactCanada, setContactCanada] = useState(null);
  const [floodZone, setFloodZone] = useState(null);

  const handleMapClick = (evt, mapView) => {
    mapView.view.hitTest(evt).then((response) => {
      const feature = response.results[0].graphic;
      if (feature) {
        setSelectedFeature(feature);

        // Query and retrieve population data within specified distances
        queryPopulationWithinDistances(mapView, feature);

        // Get location information of the clicked point
        queryLocationInfo(mapView, evt.mapPoint);

        // Determine EPA and Tribal Jurisdiction
        queryJurisdictionInfo(mapView, evt.mapPoint);

        // Check proximity to Canadian border
        checkProximityToCanada(mapView, evt.mapPoint);

        // Query FEMA Flood Zone
        queryFloodZone(mapView, evt.mapPoint);
      }
    });
  };

  const queryPopulationWithinDistances = async (mapView, clickedFeature) => {
    const distances = [0.25, 0.5, 1]; // Distances in miles
    const populationResults = [];

    for (const distance of distances) {
      const bufferGeometry = await createBufferGeometry(mapView, clickedFeature.geometry, distance);
      const population = await queryPopulation(mapView, bufferGeometry);
      populationResults.push({ distance, population });
    }

    setPopulationData(populationResults);
  };

  const createBufferGeometry = async (mapView, geometry, distance) => {
    const [geometryEngine] = await esriLoader.loadModules(['esri/geometry/geometryEngine']);

    // Create a buffer around the clicked feature's geometry
    const bufferGeometry = geometryEngine.buffer(geometry, distance, 'miles');
    return bufferGeometry;
  };

  const queryPopulation = async (mapView, geometry) => {
    const [QueryTask, Query] = await esriLoader.loadModules(['esri/tasks/QueryTask', 'esri/tasks/support/Query']);
    const queryTask = new QueryTask({
      url: 'your_feature_service_url', // Replace with the URL of your feature service
    });

    const query = new Query();
    query.geometry = geometry;
    query.returnGeometry = false;
    query.outFields = ['DAYPOP', 'NIGHTPOP'];

    const queryResult = await queryTask.execute(query);
    const features = queryResult.features;

    // Calculate population values within the buffer
    let totalDayPop = 0;
    let totalNightPop = 0;
    features.forEach((feature) => {
      totalDayPop += feature.attributes.DAYPOP;
      totalNightPop += feature.attributes.NIGHTPOP;
    });

    return { daypop: totalDayPop, nightpop: totalNightPop };
  };

  const queryLocationInfo = async (mapView, mapPoint) => {
    const [LocatorTask] = await esriLoader.loadModules(['esri/tasks/LocatorTask']);

    const locatorTask = new LocatorTask({
      url: 'your_geocoding_service_url', // Replace with the URL of your geocoding service
    });

    const params = {
      location: mapPoint,
      outFields: ['Lat', 'Lon', 'Address', 'City', 'Subregion', 'Region'], // Specify the fields you want to retrieve
    };

    locatorTask.locationToAddress(params).then((results) => {
      if (results.length > 0) {
        const locationInfo = results[0].attributes;
        setLocationData(locationInfo);
      } else {
        setLocationData(null);
      }
    });
  };

  const queryJurisdictionInfo = async (mapView, mapPoint) => {
    // Check EPA Region One Jurisdiction
    const [QueryTask] = await esriLoader.loadModules(['esri/tasks/QueryTask']);
    const epaQueryTask = new QueryTask({
      url: 'your_epa_region_one_service_url', // Replace with the URL of EPA Region One Feature Service
    });

    const epaQuery = {
      geometry: mapPoint,
      outFields: ['EPA_Jurisdiction'], // Specify the field representing EPA jurisdiction
      returnGeometry: false,
    };

    const epaQueryResult = await epaQueryTask.execute(epaQuery);
    const epaJurisdiction = epaQueryResult.features.length > 0 ? 'Region 1' : 'null';

    // Check Tribal Jurisdiction
    const tribalQueryTask = new QueryTask({
      url: 'your_tribal_jurisdiction_service_url', // Replace with the URL of Tribal Jurisdiction Feature Service
    });

    const tribalQuery = {
      geometry: mapPoint,
      outFields: ['Tribal_Jurisdiction'], // Specify the field representing Tribal jurisdiction
      returnGeometry: false,
    };

    const tribalQueryResult = await tribalQueryTask.execute(tribalQuery);
    const tribalJurisdiction =
      tribalQueryResult.features.length > 0 ? 'Within Tribal Jurisdiction' : 'Not within Tribal Jurisdiction';

    setJurisdictionData({ epaJurisdiction, tribalJurisdiction });
  };

  const checkProximityToCanada = async (mapView, mapPoint) => {
    const [QueryTask, GeometryService] = await esriLoader.loadModules(['esri/tasks/QueryTask', 'esri/tasks/GeometryService']);
    const queryTask = new QueryTask({
      url: 'your_canadian_border_service_url', // Replace with the URL of the Canadian border Feature Service
    });

    const query = {
      geometry: mapPoint,
      spatialRelationship: 'esriSpatialRelIntersects',
      returnGeometry: false,
      outFields: ['OBJECTID'], // Specify a field that exists in the Canadian border feature service
    };

    const queryResult = await queryTask.execute(query);

    if (queryResult.features.length > 0) {
      // Point is within 50 miles of Canada
      setContactCanada('Necessary to Contact Canada');
    } else {
      // Point is not within 50 miles of Canada
      setContactCanada('Not Necessary to Contact Canada');
    }
  };

  const queryFloodZone = async (mapView, mapPoint) => {
    const [QueryTask] = await esriLoader.loadModules(['esri/tasks/QueryTask']);
    const femaQueryTask = new QueryTask({
      url: 'your_fema_feature_service_url', // Replace with the URL of the FEMA feature service
    });

    const femaQuery = {
      geometry: mapPoint,
      outFields: ['FLD_Zone'], // Specify the field representing the Flood Zone
      returnGeometry: false,
    };

    const femaQueryResult = await femaQueryTask.execute(femaQuery);

    if (femaQueryResult.features.length > 0) {
      const floodZoneValue = femaQueryResult.features[0].attributes.FLD_Zone;
      setFloodZone(floodZoneValue);
    } else {
      setFloodZone(null);
    }
  };

  return (
    <div>
      <h1>Selected Feature Attributes</h1>
      <JimuMapViewComponent useMapWidgetId="yourMapWidgetId">
        {/* Render the map or other UI elements here if needed */}
      </JimuMapViewComponent>

      <table>
        <caption>Population Data</caption>
        <thead>
          <tr>
            <th>Distance</th>
            <th>1/4 Mile DAYPOP</th>
            <th>1/4 Mile NIGHTPOP</th>
            <th>1/2 Mile DAYPOP</th>
            <th>1/2 Mile NIGHTPOP</th>
            <th>1 Mile DAYPOP</th>
            <th>1 Mile NIGHTPOP</th>
          </tr>
        </thead>
        <tbody>
          {populationData.map((data) => (
            <tr key={data.distance}>
              <td>{`${data.distance} mile`}</td>
              <td>{data.population['0.25'].daypop}</td>
              <td>{data.population['0.25'].nightpop}</td>
              <td>{data.population['0.5'].daypop}</td>
              <td>{data.population['0.5'].nightpop}</td>
              <td>{data.population['1'].daypop}</td>
              <td>{data.population['1'].nightpop}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {locationData && (
        <table>
          <caption>Site Location</caption>
          <thead>
            <tr>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Address</th>
              <th>City</th>
              <th>County</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{locationData.Lat}</td>
              <td>{locationData.Lon}</td>
              <td>{locationData.Address}</td>
              <td>{locationData.City}</td>
              <td>{locationData.Subregion}</td>
              <td>{locationData.Region}</td>
            </tr>
          </tbody>
        </table>
      )}

      {jurisdictionData && (
        <table>
          <caption>Jurisdiction Data</caption>
          <thead>
            <tr>
              <th>USCG/EPA Jurisdiction</th>
              <th>Tribal Jurisdiction</th>
              <th>Contact Canada</th>
              <th>Flood Zone</th> {/* Add Flood Zone column */}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{jurisdictionData.epaJurisdiction}</td>
              <td>{jurisdictionData.tribalJurisdiction}</td>
              <td>{contactCanada}</td>
              <td>{floodZone}</td> {/* Display Flood Zone */}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ReportWidget;